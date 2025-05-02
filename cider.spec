#
# spec file for package cider
#
# Copyright (c) 2024 taoky & Cider Collective <cryptofyre@cider.sh> (https://cider.sh)
#
# All modifications and additions to the file contributed by third parties
# remain the property of their copyright owners, unless otherwise agreed
# upon. The license for this file, and modifications and additions to the
# file, is the same license as for the pristine package itself (unless the
# license for the pristine package is not an Open Source License, in which
# case the license is the MIT License). An "Open Source License" is a
# license that conforms to the Open Source Definition (Version 1.9)
# published by the Open Source Initiative.

# Please submit bugfixes or comments via https://github.com/taoky/Cider/issues
#

%global version 1.6.2

Name:     cider
Version:  %{version}
Release:  1%{?dist}
Summary:  A new cross-platform Apple Music experience
License:  AGPLv3
URL:      https://github.com/taoky/Cider
# Upstream uses "auto tagging" soooooooooooooo :3
Source:   https://github.com/taoky/Cider/releases/download/20241103221050/cider_1.6.2_amd64.deb
# Upstream only produces artifacts for x86_64
ExclusiveArch: x86_64
BuildRequires: bsdtar, gtk3, libnotify, nss, libXScrnSaver, libXtst, xdg-utils, at-spi2-core, libuuid, libsecret, libappindicator-gtk3
Requires: gtk3, libnotify, nss, libXScrnSaver, libXtst, xdg-utils, at-spi2-core, libuuid, libsecret, libappindicator-gtk3


%description
A new cross-platform Apple Music experience based on Electron and Vue.js written from scratch with performance in mind.



%prep
bsdtar -x -f %{_sourcedir}/cider_1.6.2_amd64.deb -C %{_builddir}

%build
# Already built. :(


%install
mkdir -p %{buildroot}/opt/Cider

tar -xJf %{_builddir}/data.tar.xz -C %{buildroot}


chmod 4755 %{buildroot}/opt/Cider/chrome-sandbox

%check
/opt/Cider/cider --version


%files
/opt/Cider/
%{_datadir}/icons/hicolor/
/usr/share/applications/cider.desktop
/usr/share/doc/cider/changelog.gz

%changelog
