A fork of the Cider v1 player, aimed to maintaining it to be happily running upon Linux desktop, with some fixes not in the original upstream.

## FAQ

### Breaking changes

#### Name changes

The "DesktopEntry" property of MPRIS requires a fixed desktop file name. As I have no idea how to manually specify desktop file name with `electron-builder`, I have to change binary name, and following changes are made:

- `cider.desktop` -> `sh.cider.Cider.desktop`
- (desktop entry icon) `cider` -> `sh.cider.Cider`
- `cider` binary -> `sh.cider.Cider` binary

### Account

#### Blank screen / no login window

This Cider build (and other third party apps supporting Apple Music) requires a valid Apple Music **token** (not account!) to work. Unfortunately, this is costly: an [Apple Developer Program subscription](https://developer.apple.com/programs/) is required to generate a valid token ($99 USD per year). Please read <https://developer.apple.com/documentation/applemusicapi/generating_developer_tokens> for more information.

Note that currently you could get others' token with `MusicKit.getInstance().developerToken` on webpages using [MusicKit](https://developer.apple.com/musickit/). Please refrain from using this in production (such as packaging it in your own apps). See <https://developer.apple.com/forums/thread/702228> for more discussion, and thanks for a user's email informing me about this.

This build by default still requires <https://api.cider.sh/v1/> returning a working, valid token -- currently I could not help with this if it does not work :-(.

You could press "Ctrl+Shift+I" to open devtools, switch to "Console" tab, and see if there's any error message related to, for example, expired token.

This build supports `TOKEN_API` env, which you could provide a custom API endpoint to fetch the token like this:

```sh
TOKEN_API=https://example.com/token flatpak run sh.cider.Cider  # or ./cider, or anything you like
```

`TOKEN_API` requires returning a JSON object with `token` like this:

```json
{
  "token": "xxxx"
}
```

To persist this, you could edit the `.desktop` file installed (`Exec` line). If you're using Flatpak, use [Flatseal](https://flathub.org/apps/com.github.tchx84.Flatseal) to add this environment variable.

### Flatpak

#### Why does it require --device=all in the Flatpak manifest?

Currently, FIDO2 support with Flatpak is a bit messy -- FIDO2 requires USB accesses, and currently the only way to do that is to allow it to access **all** devices.

Portal support is still in development slowly:

- <https://github.com/flatpak/xdg-desktop-portal/issues/989>
- <https://alfioemanuele.io/dev/2024/01/31/a-vision-for-passkeys-on-the-linux-desktop.html>

If you don't have a security key, you can change `--device=all` to `--device=dri` (GPU access is still required for hardware acceleration), with tools like Flatseal.

### Building

#### `libcrypto.so.1` not found

`electron-builder` requires OpenSSL 1.1 for now.

For distros that using OpenSSL 3.x, you need to install OpenSSL 1.1 compatibility libraries. For example, on Arch Linux, you can install `libxcrypt-compat` package.

---

Original README:

## ⚠ Cider Classic has approached its End-of-Life status.
This application is now no longer being actively maintained.  
No support will be given on Windows.

Thanks for your continued support.

[Get Cider 2 today.](https://cider.sh/download)

<a href="https://cider.sh/download"><img src="./src/renderer/assets/c1-c2.png" height="64px" alt="Banner"></a>
<a href="https://cidercollective.itch.io/cider"><img src="https://cider.sh/assets/itch-badge.svg" height="64px" alt="Banner"></a>
---

<p align="center">
  <a href="https://cider.sh"><img src="./resources/banner.png" width="80%" height="60%" alt="Banner"></a>
  <br>
  <b>A new cross-platform Apple Music experience based on Electron and Vue.js written from scratch with performance & visuals in mind. 🚀</b>
  <br><br>
  <img src="https://img.shields.io/github/stars/ciderapp/Cider?label=Stars" alt="GitHub Stars"/>
  <img src="https://img.shields.io/github/forks/ciderapp/Cider?label=Forks" alt="GitHub Forks"/>
  <a title="Crowdin" target="_blank" href="https://crowdin.com/project/cider-music"><img src="https://badges.crowdin.net/cider-i18n/localized.svg"></a>
  <br>
  <a target="_blank" href="https://ko-fi.com/cryptofyre"><img src="https://img.shields.io/badge/Buy%20Us%20a%20Coffee-donate-B48C69?logo=Ko-fi&logoColor=FFFFFF" alt="Buy Me A Coffee"/></a>
  <a target="_blank" href="https://opencollective.com/ciderapp"><img src="https://img.shields.io/opencollective/all/ciderapp?color=%237FADF2&label=Backers%20and%20Sponsors&logo=opencollective" alt="Open Collective"/></a>
    <a target="_blank" href="https://github.com/sponsors/ciderapp"><img src="https://img.shields.io/github/sponsors/ciderapp?color=C96198&label=GitHub%20Sponsors&logo=GitHub" alt="GitHub Sponsor"/></a>
  <br>
  <a target="_blank" href="https://jq.qq.com/?_wv=1027&k=2VP4cdyo"><img src="https://img.shields.io/badge/QQ-531185058-red" alt="QQ群"/></a>
  <a target="_blank" href="https://discord.gg/applemusic"><img src="https://img.shields.io/discord/843954443845238864?label=Discord&color=5865F2&logo=discord&logoColor=white&style=flat" alt="Discord"/></a>
  <a target="_blank" href="https://twitter.com/UseCider"><img src="https://img.shields.io/twitter/follow/UseCider?label=Twitter&color=%231DA1F2&logo=twitter&style=flat" alt="Twitter"/></a>
  <a target="_blank" href="https://reddit.com/r/applemusicelectron"><img src="https://custom-icon-badges.herokuapp.com/reddit/subreddit-subscribers/applemusicelectron?label=Reddit&color=FF5700&logo=redditnew" alt="Reddit"/></a>
  <br><br>
  <a href="https://dev.azure.com/cidercollective/Cider/_build?definitionId=14"><img src="https://dev.azure.com/cidercollective/Cider/_apis/build/status%2FCider%201.x?branchName=main" alt="Azure Pipelines Status"/></a>
</p>

#### Links

* [Documentation](https://docs.cider.sh)
* [Request Feature](https://github.com/ciderapp/Cider/discussions/new?category=feature-request)
* [Report Bug](https://github.com/ciderapp/Cider/issues/new?assignees=&labels=bug&template=bug_report.md&title=%5BBUG%5D+)
* [**View The Releases**](https://github.com/ciderapp/cider-releases/releases/latest)

### Install Sources
[![Get it from Github](https://img.shields.io/badge/Get_It_From_GitHub-100000?style=for-the-badge&logo=github&logoColor=white)](https://github.com/ciderapp/cider-releases/releases/latest)

[![Get it from Windows Package Manager](https://custom-icon-badges.herokuapp.com/badge/Get_It_via_Winget_-100000?style=for-the-badge&logo=winstall)](https://winstall.app/apps/CiderCollective.Cider)
[![Get it from Windows Package Manager](https://custom-icon-badges.herokuapp.com/badge/Get_It_via_Winget_(Nightly)_-100000?style=for-the-badge&logo=winstall)](https://winstall.app/apps/CiderCollective.Cider.Nightly)

[![Get it from Chocolatey Package Manager](https://custom-icon-badges.herokuapp.com/badge/Get_It_via_Chocolatey_-100000?style=for-the-badge&logo=chocolatey)](https://community.chocolatey.org/packages/cider)

<!--
[![Get it from Windows Package Manager](https://custom-icon-badges.herokuapp.com/badge/Get_It_via_Winget_(Nightly)_-100000?style=for-the-badge&logo=winstall)](https://winstall.app/apps/CiderCollective.Cider.Nightly)
-->

[![Get it from Flathub](https://img.shields.io/badge/Get_It_From_Flathub-100000?style=for-the-badge&logo=flathub)](https://flathub.org/apps/details/sh.cider.Cider)

<!--

[![Get it from Windows Package Manager](https://custom-icon-badges.herokuapp.com/badge/Get_It_via_Winget-100000?style=for-the-badge&logo=winstall)](https://winstall.app/apps/cryptofyre.AppleMusicElectron)

[![Get it from the Snap Store](https://img.shields.io/badge/Get_It_From_The_Snap_Store-100000?style=for-the-badge&logo=snapcraft)](https://snapcraft.io/apple-music-electron)
-->
[![Get it from the AUR](https://img.shields.io/badge/Get_It_From_The_AUR-100000?style=for-the-badge&logo=archlinux)](https://aur.archlinux.org/packages/cider)

### Insights Snapshot
[![CircleCI](https://dl.circleci.com/insights-snapshot/gh/ciderapp/Cider/main/build_and_release/badge.svg?window=30d)](https://app.circleci.com/insights/github/ciderapp/Cider/workflows/build_and_release/overview?branch=main&reporting-window=last-30-days&insights-snapshot=true)

### Credits
![Contributors](https://contrib.rocks/image?repo=ciderapp/Cider)

### Disclaimer
*This project is NOT affiliated with Apple in any way shape or form. The project is open source and free to use (with an Apple Music subscription)
for any legal concerns contact me at <a href="mailto:cryptofyre@cryptofyre.org">cryptofyre@cryptofyre.org</a>.*

<p align="center">
  <br>
  <a> Project Supporters </a>
  <br>
  <br>
  <img href="https://www.jetbrains.com/" width="120px" height="125px" src="https://logonoid.com/images/jetbrains-logo.png" alt="JetBrains">
  <img href="https://www.macstadium.com/" width="300px" src="https://user-images.githubusercontent.com/33162551/124784795-df5d4c80-df0b-11eb-99a7-dc2b1cfb81bd.png" alt="MacStadium">
</p>
