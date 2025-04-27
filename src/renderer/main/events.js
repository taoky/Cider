const Events = {
  InitEvents() {
    const app = window.app;

    // add event listener for when window.location.hash changes
    window.addEventListener("hashchange", function () {
      app.page = "blank";
      setTimeout(() => {
        app.appRoute(window.location.hash);
      }, 100);
    });

    window.addEventListener("mouseup", (e) => {
      if (e.button === 3) {
        e.preventDefault();
        app.navigateBack();
      } else if (e.button === 4) {
        e.preventDefault();
        app.navigateForward();
      }
    });

    document.addEventListener("keydown", async function (event) {
      // CTRL + R
      if (event.keyCode === 82 && event.ctrlKey) {
        event.preventDefault();
        app.confirm(app.getLz("term.reload"), (res) => {
          if (res) {
            window.location.reload();
          }
        });
      }
      // CTRL + SHIFT + R
      if (event.keyCode === 82 && event.ctrlKey && event.shiftKey) {
        event.preventDefault();
        window.location.reload();
      }
      // CTRL + E
      if (event.keyCode === 69 && event.ctrlKey) {
        app.invokeDrawer("queue");
      }
      // CTRL+H
      if (event.keyCode === 72 && event.ctrlKey) {
        app.appRoute("home");
      }
      // CTRL+SHIFT+H
      if (event.ctrlKey && event.shiftKey && event.keyCode == 72) {
        let hist = await app.mk.api.v3.music(`/v1/me/recent/played/tracks`, {
          l: app.mklang,
        });
        app.showCollection(hist.data, app.getLz("term.history"));
      }
      // CTRL+F10
      if (event.ctrlKey && event.keyCode == 121) {
        try {
          app.mk._services.mediaItemPlayback._currentPlayer.stop();
        } catch (e) {}
        try {
          app.mk._services.mediaItemPlayback._currentPlayer.destroy();
        } catch (e) {}
        try {
          this.radiohls.destroy();
          this.radiohls = null;
        } catch (_) {}
        try {
          let searchInt = setInterval(function () {
            if (document.getElementById("apple-music-player")) {
              //AudioOutputs.eqReady = true;
              document.getElementById("apple-music-player").crossOrigin = "anonymous";
              CiderAudio.source = CiderAudio.context.createMediaElementSource(document.getElementById("apple-music-player"));
              CiderAudio.source.connect(CiderAudio.audioNodes.intelliGainComp);
              clearInterval(searchInt);
            }
          }, 1000);
        } catch (e) {}
      }
      // CTRL+F11
      if (event.ctrlKey && event.keyCode == 122) {
        try {
          ipcRenderer.send("detachDT", "");
        } catch (e) {}
      }
      // Prevent Scrolling on spacebar
      if (event.keyCode === 32 && event.target === document.body) {
        event.preventDefault();
        app.SpacePause();
      }
    });

    // Hang Timer
    app.hangtimer = setTimeout(() => {
      const lastToken = localStorage.getItem("lastToken");
      const tokenAPI = window.tokenapi.get();
      var prompt = `Cider is not responding -- this might be a networking issue though, or the token from ${tokenAPI} is expired or invalid. Reload the app?`;
      function getJwtExpiration(token) {
        // Split the token into its three parts
        var parts = token.split('.');
        if (parts.length !== 3) {
          throw new Error('Invalid JWT token');
        }
      
        // The payload is the second part
        var base64Url = parts[1];
      
        // Convert Base64Url to Base64 by replacing URL specific characters and add padding if needed
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        // Add padding '=' if you're missing characters
        switch (base64.length % 4) {
          case 0:
            break;
          case 2:
            base64 += '==';
            break;
          case 3:
            base64 += '=';
            break;
          default:
            throw new Error('Illegal base64url string!');
        }
      
        // Decode the Base64 string (atob is available in browsers)
        var jsonPayload = decodeURIComponent(
          atob(base64)
            .split('')
            .map(function(c) {
              return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            })
            .join('')
        );
      
        // Parse the JSON payload and return the exp value
        var payloadObj = JSON.parse(jsonPayload);
        return payloadObj.exp;
      }
      try {
        let expiredDate = getJwtExpiration(lastToken);
        prompt += `\n Token Expiration: ${new Date(expiredDate * 1000).toLocaleString()}`;
      } catch (e) {
        console.error(e);
        prompt += `\n Token Expiration: Invalid (error ${e})`;
      }
      if (confirm(prompt)) {
        window.location.reload();
      }
    }, 10000);

    // Refresh Focus
    function refreshFocus() {
      if (document.hasFocus() == false) {
        app.windowFocus(false);
      } else {
        app.windowFocus(true);
      }
      setTimeout(refreshFocus, 200);
    }

    refreshFocus();
  },
};

export { Events };
