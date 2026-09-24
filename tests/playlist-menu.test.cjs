const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const cases = [
  ['missing relationships', undefined, null],
  ['missing artists', {}, null],
  ['empty artists', { artists: { data: [] } }, null],
  ['library artist without relationships', { artists: { data: [{ id: 'r.library', type: 'library-artists' }] } }, null],
  ['library artist without catalog', { artists: { data: [{ type: 'library-artists', relationships: {} }] } }, null],
  ['empty catalog', { artists: { data: [{ type: 'library-artists', relationships: { catalog: { data: [] } } }] } }, null],
  ['library artist with catalog', { artists: { data: [{ type: 'library-artists', relationships: { catalog: { data: [{ id: '123' }] } } }] } }, '123'],
  ['catalog artist', { artists: { data: [{ id: '456', type: 'artists' }] } }, '456'],
];

for (const componentName of ['cider-playlist', 'playlist-inline']) {
  for (const [description, relationships, artistId] of cases) {
    test(`${componentName}: ${description}`, async () => {
      let component;
      let menu;
      let favorite;
      const event = {};
      const app = {
        getLz: (key) => key,
        getRating: async () => 0,
        followingArtist: (id) => {
          assert.equal(id, artistId);
          return false;
        },
        setArtistFavorite: (id, value) => { favorite = [id, value]; },
        showMenuPanel: (items, receivedEvent) => {
          assert.equal(receivedEvent, event);
          menu = items;
        },
      };
      const source = fs.readFileSync(path.join(__dirname, `../src/renderer/views/pages/${componentName}.ejs`), 'utf8');
      const script = source.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
      vm.runInNewContext(script, {
        Vue: { component: (_name, definition) => { component = definition; } },
        app,
      });
      await component.methods.menu.call({ data: { type: 'library-albums', relationships }, app }, event);
      assert.ok(menu.items.share);
      if (componentName === 'playlist-inline') {
        assert.equal(menu.items.follow.hidden, artistId === null);
        assert.equal(menu.items.unfollow.hidden, true);
        if (artistId !== null) {
          menu.items.follow.action();
          assert.deepEqual(favorite, [artistId, true]);
        }
      } else {
        assert.equal(menu.headerItems.find((item) => item.id === 'love').disabled, false);
      }
    });
  }
}
