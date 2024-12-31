import { powerSaveBlocker } from "electron";
import * as dbus from "dbus-next";

// Cider sometimes does not have a window (playing music backgrounded)
// So it's impossible to use Wayland inhibitor protocol...
// Electron (Chromium) by default uses Wayland inhibitor protocol under the hood, and it could not be changed
// So we have to implement it with XDG desktop portal ourselves
class LinuxInhibitXDGPortal {
  private bus: dbus.MessageBus | null = null;
  private inhibit_interface: dbus.ClientInterface | null = null;
  private inhibitPath: string | null = null;

  constructor(bus: dbus.MessageBus | null, interface_: dbus.ClientInterface | null) {
    this.bus = bus;
    this.inhibit_interface = interface_;
  }

  static async create() {
    let interface_: dbus.ClientInterface | null = null;
    let bus: dbus.MessageBus | null = null;
    try {
      bus = dbus.sessionBus();
      const proxy = await bus.getProxyObject("org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop");
      interface_ = proxy.getInterface("org.freedesktop.portal.Inhibit");
    } catch (e) {
      console.error("[Plugin][Inhibit suspend when music is playing] Unexpected error: Failed to connect to XDG Portal D-Bus service:", e);
      bus = null;
      interface_ = null;
    }
    return new LinuxInhibitXDGPortal(bus, interface_);
  }

  async inhibit() {
    if (this.inhibit_interface === null) {
      console.debug("[Plugin][Inhibit suspend when music is playing] Unexpected error: XDG Portal is not initialized.");
      return;
    }

    if (this.inhibitPath !== null) {
      console.debug("[Plugin][Inhibit suspend when music is playing] Already inhibited.");
      return;
    }

    // https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Inhibit.html#org-freedesktop-portal-inhibit-inhibit
    this.inhibitPath = await this.inhibit_interface?.Inhibit("", 4, { reason: new dbus.Variant("s", "Music is playing"), handle_token: new dbus.Variant("s", "ciderfork_taoky_" + Math.floor(Math.random() * 100000)) });
    console.debug("[Plugin][Inhibit suspend when music is playing] Inhibited with path:", this.inhibitPath);
  }

  async uninhibit() {
    if (this.inhibitPath === null || this.bus === null) {
      console.debug("[Plugin][Inhibit suspend when music is playing] Not inhibited.");
      return;
    }

    const proxy = await this.bus.getProxyObject("org.freedesktop.portal.Desktop", this.inhibitPath);
    const interface_ = proxy.getInterface("org.freedesktop.portal.Request");
    await interface_.Close();
    this.inhibitPath = null;
  }
}

export default class inhibit {
  public name: string = "Inhibit suspend when music is playing";
  public description: string = "Prevents the system from suspending when music is playing.";
  public version: string = "1.0.0";
  public author: string = "Core";

  private blockerId: number | null = null;
  private portal: LinuxInhibitXDGPortal | null = null;

  private isLinux(): boolean {
    return process.platform === "linux";
  }

  constructor() {
    console.debug(`[Plugin][${this.name}] Loading Complete.`);
  }

  private async startInhibitor() {
    try {
      if (this.isLinux()) {
        if (this.portal === null) {
          this.portal = await LinuxInhibitXDGPortal.create();
        }
        this.portal.inhibit();
      } else {
        if (this.blockerId === null) {
          this.blockerId = powerSaveBlocker.start("prevent-app-suspension");
        }
      }
    } catch (e) {
      console.error("[Plugin][Inhibit suspend when music is playing] Unexpected error:", e);
    }
  }

  private async stopInhibitor() {
    try {
      if (this.isLinux() && this.portal !== null) {
        if (this.portal === null) {
          this.portal = await LinuxInhibitXDGPortal.create();
        }
        this.portal.uninhibit();
      } else {
        if (this.blockerId !== null) {
          powerSaveBlocker.stop(this.blockerId);
          this.blockerId = null;
        }
      }
    } catch (e) {
      console.error("[Plugin][Inhibit suspend when music is playing] Unexpected error:", e);
    }
  }

  async onPlaybackStateDidChange(attributes: any): Promise<void> {
    if (attributes?.status) {
      await this.startInhibitor();
    } else {
      await this.stopInhibitor();
    }
  }

  async onBeforeQuit(): Promise<void> {
    await this.stopInhibitor();
  }
}
