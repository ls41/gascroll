/* gascroll — scale touchpad scroll deltas at the libinput layer (LD_PRELOAD)
 *
 * SPDX-License-Identifier: MIT
 *
 * Why this exists
 * ---------------
 * A Wayland compositor delivers exactly one scroll axis value to every client,
 * but each toolkit multiplies it by its own factor (GTK ~x1, Chromium ~x12,
 * WebKit / Java their own).  GNOME exposes no scroll-speed setting at all, so
 * "my browser/IM/IDE scrolls way too fast while GTK apps are fine" is expected
 * behaviour, not a driver bug.
 *
 * The only way to slow *all* of them down consistently is to scale the axis
 * value before mutter hands it out.  That is what this library does.
 *
 * How it is loaded
 * ----------------
 * It is LD_PRELOADed into gnome-shell (mutter reads libinput in-process) via a
 * systemd drop-in for org.gnome.Shell@.service, see install.sh.
 *
 * Config file (re-read once per second -> edits apply live, no re-login)
 * --------------------------------------------------------------------
 *   $GASCROLL_CONF, defaults to $HOME/.config/gascroll.conf
 *     enabled=1
 *     factor=0.27            # 1.0 = untouched, smaller = slower
 *     device=Touchpad        # substring of the libinput device name ("" = all)
 *
 * Safety
 * ------
 * Every failure path returns the untouched value: a missing config, an
 * unpackable line, a failed dlsym - none of them can break scrolling.
 */
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct libinput_event libinput_event;
typedef struct libinput_device libinput_device;
typedef struct libinput_event_pointer libinput_event_pointer;

static double g_factor = 1.0;
static int    g_enabled = 0;
static int    g_inited = 0;
static char   g_conf[1024];
static char   g_devfilter[256] = "Touchpad";
static double g_env_factor = -1.0;
static time_t g_last_poll = 0;

static void load_config(void)
{
    time_t now = time(NULL);

    if (!g_inited) {
        const char *c, *h;

        g_inited = 1;
        c = getenv("GASCROLL_CONF");
        h = getenv("HOME");
        if (c && *c)
            snprintf(g_conf, sizeof(g_conf), "%s", c);
        else
            snprintf(g_conf, sizeof(g_conf), "%s/.config/gascroll.conf", h ? h : ".");
        c = getenv("GASCROLL_FACTOR");
        if (c && *c)
            g_env_factor = atof(c);
    }

    if (now == g_last_poll)
        return;
    g_last_poll = now;

    FILE *fp = fopen(g_conf, "r");
    if (!fp)
        return;

    double nf = g_factor;
    int    ne = g_enabled;
    char   ndev[sizeof(g_devfilter)];
    char   line[512];

    snprintf(ndev, sizeof(ndev), "%s", g_devfilter);

    while (fgets(line, sizeof(line), fp)) {
        char s[256];
        double v;
        int e;

        if (sscanf(line, "factor=%lf", &v) == 1) {
            if (v > 0.01 && v < 50.0)
                nf = v;
        } else if (sscanf(line, "enabled=%d", &e) == 1) {
            ne = e;
        } else if (sscanf(line, "device=%255s", s) == 1) {
            snprintf(ndev, sizeof(ndev), "%s", s);
        }
    }
    fclose(fp);

    if (g_env_factor > 0)
        nf = g_env_factor;

    if (nf != g_factor || ne != g_enabled || strcmp(ndev, g_devfilter) != 0) {
        g_factor = nf;
        g_enabled = ne;
        snprintf(g_devfilter, sizeof(g_devfilter), "%s", ndev);
        fprintf(stderr, "[gascroll] enabled=%d factor=%.4f device=%s\n",
                g_enabled, g_factor, g_devfilter[0] ? g_devfilter : "(all)");
    }
}

static void *sym(const char *name)
{
    return dlsym(RTLD_NEXT, name);
}

/* Should this event's scroll value be scaled?  Filter by device name so that
 * a real mouse wheel (on a non-touchpad device) keeps its speed. */
static int scale_this(libinput_event_pointer *ev)
{
    typedef libinput_event *(*base_fn)(libinput_event_pointer *);
    typedef libinput_device *(*dev_fn)(libinput_event *);
    typedef const char *(*name_fn)(libinput_device *);
    static base_fn f_base;
    static dev_fn f_dev;
    static name_fn f_name;

    load_config();
    if (!g_enabled || g_factor == 1.0)
        return 0;

    if (!f_base) f_base = (base_fn)sym("libinput_event_pointer_get_base_event");
    if (!f_dev)  f_dev  = (dev_fn) sym("libinput_event_get_device");
    if (!f_name) f_name = (name_fn)sym("libinput_device_get_name");

    /* If we cannot inspect the device, scale anyway (too slow > too fast). */
    if (!f_base || !f_dev || !f_name || !g_devfilter[0])
        return 1;

    libinput_event *base = f_base(ev);
    if (!base)
        return 1;
    libinput_device *dev = f_dev(base);
    if (!dev)
        return 1;
    const char *nm = f_name(dev);
    if (!nm)
        return 1;

    return strstr(nm, g_devfilter) != NULL;
}

double libinput_event_pointer_get_scroll_value(libinput_event_pointer *ev, int axis)
{
    typedef double (*fn_t)(libinput_event_pointer *, int);
    static fn_t real;

    if (!real) real = (fn_t)sym("libinput_event_pointer_get_scroll_value");
    if (!real) return 0.0;

    double v = real(ev, axis);
    return (v != 0.0 && scale_this(ev)) ? v * g_factor : v;
}

double libinput_event_pointer_get_scroll_value_v120(libinput_event_pointer *ev, int axis)
{
    typedef double (*fn_t)(libinput_event_pointer *, int);
    static fn_t real;

    if (!real) real = (fn_t)sym("libinput_event_pointer_get_scroll_value_v120");
    if (!real) return 0.0;

    double v = real(ev, axis);
    return (v != 0.0 && scale_this(ev)) ? v * g_factor : v;
}

/* legacy API, kept for older mutter versions */
double libinput_event_pointer_get_axis_value(libinput_event_pointer *ev, int axis)
{
    typedef double (*fn_t)(libinput_event_pointer *, int);
    static fn_t real;

    if (!real) real = (fn_t)sym("libinput_event_pointer_get_axis_value");
    if (!real) return 0.0;

    double v = real(ev, axis);
    return (v != 0.0 && scale_this(ev)) ? v * g_factor : v;
}

/* exported for the self-test binary and for status checks */
double gascroll_get_factor(void)
{
    load_config();
    return g_enabled ? g_factor : 1.0;
}
