# gascroll - build & install the LD_PRELOAD scroll scaler
#
#   make            build libgascroll.so into build/
#   make test       build and run the config/self test
#   sudo make install-ld   put the library in /usr/local/lib (optional)
#   make install    build + install library, systemd drop-in, GNOME extension
#   make uninstall  undo the above (session re-login needed to take effect)
#
# NOTE: install.sh does the same thing with more checks and is what the README
#       tells users to run.  The Makefile is a convenience wrapper.

PREFIX      ?= $(HOME)/.local
LIBDIR      ?= $(PREFIX)/lib
LIB         := libgascroll.so
UUID        ?= gascroll@ga
EXTDIR      ?= $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
DROPIN      ?= $(HOME)/.config/systemd/user/org.gnome.Shell@.service.d/override.conf

all: build/$(LIB)

build/$(LIB): src/gascroll.c
	@mkdir -p build
	gcc -shared -fPIC -O2 -Wall -Wextra -o $@.tmp $< -ldl -lm
	mv -f $@.tmp $@        # atomic rename: safe while gnome-shell maps the old file

test: build/$(LIB)
	@mkdir -p build
	gcc -o build/selftest tests/selftest.c -ldl
	GASCROLL_CONF=build/selftest.conf ./build/selftest build/$(LIB)

install: build/$(LIB)
	@mkdir -p $(LIBDIR)
	cp -f build/$(LIB) $(LIBDIR)/$(LIB).tmp && mv -f $(LIBDIR)/$(LIB).tmp $(LIBDIR)/$(LIB)
	@mkdir -p $(dir $(DROPIN))
	printf '[Service]\nEnvironment=LD_PRELOAD=%s/%s\n' "$(LIBDIR)" "$(LIB)" > $(DROPIN)
	@mkdir -p $(dir $(EXTDIR))
	rm -rf $(EXTDIR)
	cp -r extension $(EXTDIR)
	systemctl --user daemon-reload || true
	@echo "installed.  Log out and back in once so gnome-shell picks it up."

uninstall:
	rm -f $(DROPIN)
	rm -rf $(EXTDIR)
	rm -f $(LIBDIR)/$(LIB)
	systemctl --user daemon-reload || true
	@echo "removed.  Log out and back in to fully unload."

clean:
	rm -rf build

test-prefs:                # regression test: prefs.js must import without Shell-only resources
	GI_TYPELIB_PATH=/usr/lib/gnome-shell/girepository-1.0 \
	LD_LIBRARY_PATH=/usr/lib/gnome-shell \
	gjs -m tests/prefs-import-test.mjs extension/prefs.js

.PHONY: all test test-prefs install uninstall clean
