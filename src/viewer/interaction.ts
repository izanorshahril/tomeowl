export function bindKeyboardShortcuts(root: HTMLElement, search: HTMLInputElement, dialog: HTMLDialogElement) {
  const keydown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); root.querySelector<HTMLElement>('[data-action="palette"]')?.click();
    }
    if (event.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement).tagName) && !(event.target as HTMLElement).isContentEditable) {
      event.preventDefault(); if(!search.getClientRects().length)root.querySelector<HTMLElement>('[data-action="sources"]')?.click();search.focus();
    }
    if (event.key === "Escape" && dialog.open) dialog.close();
  };
  document.addEventListener("keydown", keydown);
  return () => document.removeEventListener("keydown", keydown);
}
