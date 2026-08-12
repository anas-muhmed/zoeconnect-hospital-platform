import { Menu } from 'electron';

/**
 * Hospital kiosks must not expose any application chrome: no menu bar,
 * no "File/Edit/View" access, nothing that leads back to an address bar
 * or devtools via a menu item. Electron ships a default menu (with
 * Reload, Toggle DevTools, etc.) unless explicitly removed -- this is
 * that removal, called once at startup before any window is created.
 */
export function disableApplicationMenu(): void {
  Menu.setApplicationMenu(null);
}
