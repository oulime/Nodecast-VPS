export const vDragScroll = {
  mounted(el) {
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    let isDragging = false;

    el.classList.add('cursor-grab', 'select-none');
    el.style.overflowX = 'auto';
    el.style.touchAction = 'pan-x';
    el.style.webkitOverflowScrolling = 'touch';

    // Mouse drag
    el.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      isDown = true;
      isDragging = false;
      el.classList.remove('cursor-grab');
      el.classList.add('cursor-grabbing');
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    });

    const endDrag = () => {
      if (!isDown) return;
      isDown = false;
      el.classList.remove('cursor-grabbing');
      el.classList.add('cursor-grab');
      if (isDragging) {
        const preventClick = (clickEvent) => {
          clickEvent.stopPropagation();
          clickEvent.preventDefault();
          window.removeEventListener('click', preventClick, true);
        };
        window.addEventListener('click', preventClick, true);
      }
    };

    el.addEventListener('mouseleave', endDrag);
    el.addEventListener('mouseup', endDrag);

    el.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 1.6;
      if (Math.abs(walk) > 4) {
        isDragging = true;
        e.preventDefault();
      }
      el.scrollLeft = scrollLeft - walk;
    });

    // Support horizontal scrolling with vertical mouse wheel
    el.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0 && el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        el.scrollLeft += e.deltaY * 0.9;
      }
    }, { passive: false });
  }
};
