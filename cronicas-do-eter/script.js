// Menu lateral retrátil + visual helpers
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    const toggles = document.querySelectorAll('.nav-toggle, .sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const closeButton = document.querySelector('.sidebar-close');

    let backdrop = document.querySelector('.mobile-sidebar-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'mobile-sidebar-backdrop';
      document.body.appendChild(backdrop);
    }

    function closeMenu() {
      if (!sidebar) return;
      sidebar.classList.remove('open');
      document.body.classList.remove('nav-open');
      toggles.forEach(toggle => toggle.setAttribute('aria-expanded', 'false'));
    }

    function openMenu() {
      if (!sidebar) return;
      sidebar.classList.add('open');
      document.body.classList.add('nav-open');
      toggles.forEach(toggle => toggle.setAttribute('aria-expanded', 'true'));
    }

    toggles.forEach(toggle => {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        if (sidebar && sidebar.classList.contains('open')) closeMenu();
        else openMenu();
      });
    });

    if (closeButton) closeButton.addEventListener('click', closeMenu);
    if (sidebar) sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
    backdrop.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    // Links premium aparecem apenas quando o auth-widget marcar body.auth-approved.
    // O CSS já deixa esses links escondidos por padrão.

    // Scroll reveal
    const reveals = document.querySelectorAll('.reveal');
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
      reveals.forEach(el => observer.observe(el));
    } else {
      reveals.forEach(el => el.classList.add('visible'));
    }
  });
})();
