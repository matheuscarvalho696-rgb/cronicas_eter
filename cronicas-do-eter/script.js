// Mobile navigation + visual helpers
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(() => {
    const toggle = document.querySelector('.nav-toggle');
    const sidebar = document.querySelector('.sidebar');

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
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      if (!sidebar) return;
      sidebar.classList.add('open');
      document.body.classList.add('nav-open');
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    }

    if (toggle && sidebar) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.addEventListener('click', () => {
        if (sidebar.classList.contains('open')) closeMenu();
        else openMenu();
      });

      sidebar.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
      backdrop.addEventListener('click', closeMenu);
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMenu();
      });

      window.addEventListener('resize', () => {
        if (window.innerWidth > 920) closeMenu();
      });
    }

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
