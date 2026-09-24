/* selftest: dlopen the built library and verify config parsing + live reload.
 *   gcc -o selftest tests/selftest.c -ldl && ./selftest build/libgascroll.so
 * SPDX-License-Identifier: MIT */
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv)
{
    if (argc < 2) {
        fprintf(stderr, "usage: %s path/to/libgascroll.so\n", argv[0]);
        return 2;
    }

    void *h = dlopen(argv[1], RTLD_NOW);
    if (!h) {
        fprintf(stderr, "dlopen failed: %s\n", dlerror());
        return 1;
    }

    double (*get)(void) = (double (*)(void))dlsym(h, "gascroll_get_factor");
    if (!get) {
        fprintf(stderr, "dlsym failed: %s\n", dlerror());
        return 1;
    }

    const char *conf = getenv("GASCROLL_CONF");
    const char *path = conf ? conf : "./selftest.conf";

    FILE *f = fopen(path, "w");
    if (!f) { perror("fopen"); return 1; }
    fputs("enabled=1\nfactor=0.25\ndevice=Touchpad\n", f);
    fclose(f);
    double a = get();
    printf("factor (enabled=1, factor=0.25) = %.4f\n", a);

    f = fopen(path, "w");
    fputs("enabled=1\nfactor=0.40\ndevice=Touchpad\n", f);
    fclose(f);
    sleep(2);                        /* config is polled once per second */
    double b = get();
    printf("factor after live edit          = %.4f\n", b);

    f = fopen(path, "w");
    fputs("enabled=0\nfactor=0.40\n", f);
    fclose(f);
    sleep(2);
    double c = get();
    printf("factor while disabled           = %.4f\n", c);

    int ok = (a > 0.24 && a < 0.26) && (b > 0.39 && b < 0.41) && (c == 1.0);
    printf("%s\n", ok ? "SELFTEST OK" : "SELFTEST FAILED");
    return ok ? 0 : 1;
}
