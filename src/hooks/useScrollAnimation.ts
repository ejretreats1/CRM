import { useEffect } from 'react';

export function useScrollAnimation() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );

    function observe() {
      document.querySelectorAll('.scroll-fade:not(.is-visible)').forEach(el => io.observe(el));
    }

    observe();

    // Re-observe whenever the DOM changes (SPA view switches, data loads)
    const mo = new MutationObserver(observe);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
}
