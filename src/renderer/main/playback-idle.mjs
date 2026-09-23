// MusicKit pause leaves DRM renewal timers alive. Stop after a long pause, using
// the retained SDK queue and its startTime option to resume without rebuilding it.
export function installPlaybackIdle(mk, MusicKit, { idleMs = 5 * 60 * 1000, setTimer = setTimeout, clearTimer = clearTimeout, onError = console.warn, onChange = () => {} } = {}) {
  let timer = null;
  let suspended = null;
  let releasing = null;
  let resuming = null;
  let resumeFailed = false;
  let interruptingResume = null;
  let restoring = null;
  let activity = 0;
  const originalStop = mk.stop.bind(mk);
  const originalPlay = mk.play.bind(mk);
  const originalSetQueue = mk.setQueue.bind(mk);
  const originalPlayLater = mk.playLater.bind(mk);

  function setSuspended(value) {
    suspended = value;
    onChange();
  }

  function display() {
    const snapshot = matchesQueue() && !mk.isPlaying ? suspended : null;
    const duration = snapshot ? snapshot.duration : mk.currentPlaybackDuration;
    const time = snapshot ? snapshot.time : mk.currentPlaybackTime;
    return {
      nowPlayingItem: snapshot ? snapshot.item : mk.nowPlayingItem,
      currentPlaybackTime: time,
      currentPlaybackDuration: duration,
      currentPlaybackTimeRemaining: snapshot ? Math.max(0, duration - time) : mk.currentPlaybackTimeRemaining,
      currentPlaybackProgress: snapshot ? (duration > 0 ? time / duration : 0) : mk.currentPlaybackProgress,
      isPlaying: mk.isPlaying,
    };
  }

  function cancelTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function matchesQueue() {
    return suspended && mk.queue === suspended.queue && mk.queue.position === suspended.position && mk.queue.item(suspended.position) === suspended.queueItem;
  }

  function interruptResume() {
    if (interruptingResume) return interruptingResume;
    if (!resuming) return Promise.resolve();
    const resume = resuming;
    interruptingResume = Promise.resolve()
      .then(async () => {
        let poll;
        try {
          const target = await Promise.race([
            resume.then(
              () => null,
              () => null
            ),
            new Promise((resolve) => {
              // A stop can arrive while authorization/metadata is loading,
              // before play() has created its media playback sequence.
              function check() {
                if (resuming !== resume) return resolve(null);
                const player = mk._services?.mediaItemPlayback?.getCurrentPlayer?.();
                const pending = player?._deferredPlay;
                if (pending?.promise && typeof pending.resolve === "function" && typeof player.resetDeferredPlay === "function") return resolve({ player, pending });
                poll = setTimer(check, 50);
              }
              check();
            }),
          ]);
          if (target && resuming === resume && target.player._deferredPlay === target.pending) {
            const { player, pending } = target;
            // MusicKit v2/v3 stop() waits for this playback sequence before
            // tearing down HLS. Detach it as the SDK's error handlers do, then
            // stop the player before waking the old playback call. Merely
            // resolving it first can let HLS keep loading/playing the old song.
            player.resetDeferredPlay();
            try {
              await originalStop({ userInitiated: false });
            } finally {
              pending.resolve();
            }
          }
        } finally {
          if (poll !== undefined) clearTimer(poll);
        }
        // Drain SDK continuations and our resume finalizer before any new
        // selection: they can still update playback state after being woken.
        await resume.catch(() => {});
      })
      .finally(() => {
        interruptingResume = null;
      });
    return interruptingResume;
  }

  function schedule() {
    if (restoring || releasing || resuming) return;
    if (mk.playbackState !== MusicKit.PlaybackStates.paused || mk.isPlaying || !mk.nowPlayingItem) {
      cancelTimer();
      return;
    }
    if (timer !== null) return;
    timer = setTimer(() => {
      timer = null;
      if (mk.playbackState !== MusicKit.PlaybackStates.paused || mk.isPlaying || !mk.nowPlayingItem) return;
      const queue = mk.queue;
      const item = mk.nowPlayingItem;
      const queueItem = queue?.item(queue.position);
      // MusicKit v2/v3 consume this map before loading the queued item, so the
      // saved position is applied before audio starts. Do not stop if unavailable.
      const playOptions = mk._services?.mediaItemPlayback?.playOptions;
      if (!queueItem || queueItem.id !== item.id || !(playOptions instanceof Map)) return;
      setSuspended({ item, queue, queueItem, position: queue.position, time: mk.currentPlaybackTime, duration: mk.currentPlaybackDuration });
      releasing = Promise.resolve()
        .then(() => originalStop({ userInitiated: false }))
        .catch((error) => onError("[Cider] Failed to release idle playback", error))
        .finally(() => {
          releasing = null;
          // The SDK may report errors through events instead of rejecting stop().
          if (mk.nowPlayingItem) setSuspended(null);
          schedule();
        });
    }, idleMs);
  }

  mk.play = async function (...args) {
    activity++;
    cancelTimer();
    if (restoring) await restoring.catch(() => {});
    if (releasing) await releasing;
    if (interruptingResume) await interruptingResume;
    if (resuming) return resuming;
    if (!matchesQueue()) {
      setSuspended(null);
      try {
        return await originalPlay(...args);
      } finally {
        schedule();
      }
    }
    const snapshot = suspended;
    const playOptions = mk._services.mediaItemPlayback.playOptions;
    const previousOptions = playOptions.get(snapshot.queueItem.id);
    const options = { ...previousOptions, startTime: Number.isFinite(snapshot.time) ? Math.max(0, snapshot.time) : 0 };
    playOptions.set(snapshot.queueItem.id, options);
    resumeFailed = false;
    resuming = Promise.resolve()
      .then(() => (interruptingResume ? undefined : originalPlay(...args)))
      .catch((error) => {
        resumeFailed = true;
        throw error;
      })
      .finally(async () => {
        // A failed load must not leave a startTime attached to a later selection.
        if (playOptions.get(snapshot.queueItem.id) === options) {
          if (previousOptions === undefined) playOptions.delete(snapshot.queueItem.id);
          else playOptions.set(snapshot.queueItem.id, previousOptions);
        }
        // play() can settle while the loaded track is buffering or seeking.
        // isPlaying is false in those normal states, not evidence of failure.
        if (!resumeFailed && !interruptingResume && mk.nowPlayingItem) setSuspended(null);
        else if ((resumeFailed || interruptingResume) && mk.nowPlayingItem) {
          // Only a reported failure or explicit interruption warrants teardown.
          // Retain the snapshot so a retry reloads with the saved offset.
          try {
            await originalStop({ userInitiated: false });
          } catch (error) {
            onError("[Cider] Failed to clean up an interrupted resume", error);
          }
        }
        resuming = null;
        schedule();
      });
    return resuming;
  };

  // All playback entry points (UI, media keys and remotes) use the same SDK
  // instance. Interrupt an unfinished resume, then wait for cleanup before
  // allowing a new selection to start.
  for (const method of ["stop", "setQueue", "setStationQueue", "changeToMediaAtIndex", "changeToMediaItem", "playMediaItem", "skipToNextItem", "skipToPreviousItem"]) {
    if (typeof mk[method] !== "function") continue;
    const original = mk[method].bind(mk);
    mk[method] = async function (...args) {
      activity++;
      cancelTimer();
      if (restoring) await restoring.catch(() => {});
      if (releasing) await releasing;
      if (resuming || interruptingResume) await interruptResume();
      setSuspended(null);
      return original(...args);
    };
  }

  const originalPause = mk.pause.bind(mk);
  mk.pause = async function (...args) {
    activity++;
    if (restoring) await restoring.catch(() => {});
    if (releasing) await releasing;
    if (resuming || interruptingResume) await interruptResume();
    return originalPause(...args);
  };

  const originalSeek = mk.seekToTime.bind(mk);
  mk.seekToTime = async function (time, ...args) {
    activity++;
    if (restoring) await restoring.catch(() => {});
    if (releasing) await releasing;
    if (resuming) await resuming.catch(() => {});
    if (matchesQueue() && !mk.nowPlayingItem) {
      const position = Number(time); // HTML range inputs supply strings.
      if (Number.isFinite(position)) {
        setSuspended({ ...suspended, time: Math.min(suspended.duration, Math.max(0, position)) });
      }
      return;
    }
    return originalSeek(time, ...args);
  };

  mk.addEventListener(MusicKit.Events.playbackStateDidChange, schedule);
  mk.addEventListener(MusicKit.Events.mediaPlaybackError, () => {
    // MusicKit can report a load error through an event and resolve play().
    if (resuming) resumeFailed = true;
  });
  mk.addEventListener(MusicKit.Events.nowPlayingItemDidChange, () => {
    if (restoring || releasing || resuming) return;
    // Some SDK notifications can arrive after stop() resolves.
    if (!mk.nowPlayingItem && matchesQueue()) return;
    setSuspended(null);
    cancelTimer();
    schedule();
  });
  schedule();

  return {
    get isRestoring() {
      return restoring !== null;
    },
    async restoreOnStartup({ behavior, storage, language }) {
      if (behavior === "disabled") return false;
      const initialActivity = activity;
      let item;
      let time = 0;
      let tail = [];
      if (behavior === "history") {
        const history = await mk.api.v3.music("/v1/me/recent/played/tracks", { l: language });
        item = history.data.data[0];
      } else {
        item = JSON.parse(storage.getItem("currentTrack") || "null");
        time = Number(storage.getItem("currentTime"));
        try {
          const cachedQueue = JSON.parse(storage.getItem("currentQueue") || "null");
          if (Array.isArray(cachedQueue)) tail = cachedQueue;
        } catch (error) {
          onError("[Cider] Ignoring invalid saved queue", error);
        }
      }
      // A user selection made while history was loading takes precedence.
      if (activity !== initialActivity || mk.nowPlayingItem || !item?.attributes?.playParams) return false;
      if (!(mk._services?.mediaItemPlayback?.playOptions instanceof Map)) return false;
      const params = item.attributes.playParams;
      const queueOptions = (params) => ({ [params.kind.endsWith("s") ? params.kind : `${params.kind}s`]: [params.id], parameters: { l: language } });
      if (!params.kind || !params.id) return false;
      restoring = Promise.resolve().then(async () => {
        // setQueue loads metadata only. Never play/mute to initialize a paused UI.
        const queue = await originalSetQueue(queueOptions(params));
        queue.position = 0;
        const queueItem = queue.item(0);
        if (!queueItem) return false;
        const duration = Number(queueItem.attributes?.durationInMillis ?? item.attributes.durationInMillis) / 1000;
        const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
        setSuspended({ item: queueItem, queue, queueItem, position: 0, duration: safeDuration, time: Number.isFinite(time) ? Math.min(safeDuration, Math.max(0, time)) : 0 });
        const batches = [];
        for (const [index, entry] of tail.entries()) {
          const next = entry?.playParams ?? entry?.attributes?.playParams ?? entry?.item?.attributes?.playParams;
          if (!next?.id || !next.kind || (index === 0 && next.id === params.id)) continue;
          const kind = next.kind.endsWith("s") ? next.kind : `${next.kind}s`;
          const previous = batches[batches.length - 1];
          if (previous?.kind === kind) previous.ids.push(next.id);
          else batches.push({ kind, ids: [next.id] });
        }
        for (const batch of batches) {
          try {
            await originalPlayLater({ [batch.kind]: batch.ids, parameters: { l: language } });
          } catch (error) {
            onError("[Cider] Could not restore a queued item", error);
          }
        }
        return true;
      });
      try {
        return await restoring;
      } finally {
        restoring = null;
      }
    },
    get display() {
      return display();
    },
    get snapshot() {
      return matchesQueue() ? { item: suspended.item, time: suspended.time } : null;
    },
  };
}
