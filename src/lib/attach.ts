// For a row that scrolls sideways on phones: start with the current item ([aria-current]) in view.
export const centerCurrent = (el: HTMLElement) => {
	const cur = el.querySelector<HTMLElement>('[aria-current]');
	if (cur) el.scrollLeft = cur.offsetLeft - (el.clientWidth - cur.offsetWidth) / 2;
};
