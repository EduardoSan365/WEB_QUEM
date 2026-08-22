/**
 * qüem Smart & Shop — Interactive UI Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Mobile Navigation Drawer Toggle
  const menuToggle = document.querySelector('.menu-toggle');
  const navMenu = document.querySelector('.nav-menu');

  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', () => {
      navMenu.classList.toggle('active');
    });

    // Close menu when clicking links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navMenu.classList.remove('active');
      });
    });
  }

  // Active navigation link on scroll
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  const onScroll = () => {
    const scrollY = window.pageYOffset;

    sections.forEach(current => {
      const sectionHeight = current.offsetHeight;
      const sectionTop = current.offsetTop - 120;
      const sectionId = current.getAttribute('id');

      if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
        navLinks.forEach(link => {
          link.classList.remove('active');
          if (link.getAttribute('href') === `#${sectionId}`) {
            link.classList.add('active');
          }
        });
      }
    });
  };

  window.addEventListener('scroll', onScroll);

  // Form submission simulation
  const contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;

      submitBtn.disabled = true;
      submitBtn.innerHTML = `<span><i class="fa-solid fa-spinner fa-spin"></i> ENVIANDO...</span>`;

      setTimeout(() => {
        submitBtn.innerHTML = `<span><i class="fa-solid fa-circle-check"></i> ¡CONSULTA ENVIADA!</span>`;
        submitBtn.style.background = '#27C93F';
        submitBtn.style.color = '#FFFFFF';
        contactForm.reset();

        setTimeout(() => {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalText;
          submitBtn.style.background = '';
          submitBtn.style.color = '';
        }, 4000);
      }, 1200);
    });
  }

  // ==========================================================================
  // Interactive Particles (Opción 1: Diamantes Tech & Micro-Pixeles)
  // Se extiende desde el Hero hasta el Marquee/Carrusel
  // ==========================================================================
  const heroArea = document.getElementById('heroInteractiveArea');
  const canvas = document.getElementById('heroParticlesCanvas');

  if (heroArea && canvas) {
    const ctx = canvas.getContext('2d');
    let width = 0;
    let height = 0;
    let particles = [];
    let animationFrameId = null;

    const mouse = {
      x: 0,
      y: 0,
      targetX: 0,
      targetY: 0,
      radius: 170,
      active: false
    };

    class DiamondParticle {
      constructor(w, h) {
        this.reset(w, h, true);
      }

      reset(w, h, initial = false) {
        this.x = Math.random() * w;
        this.y = initial ? Math.random() * h : Math.random() * h;
        this.size = Math.random() * 5.5 + 2.5; // Tamaño de 2.5 a 8px
        this.baseSize = this.size;
        this.vx = (Math.random() - 0.5) * 0.35;
        this.vy = (Math.random() - 0.5) * 0.35;
        this.angle = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.015;
        this.opacity = Math.random() * 0.28 + 0.08;
        this.baseOpacity = this.opacity;
      }

      update(w, h) {
        this.x += this.vx;
        this.y += this.vy;
        this.angle += this.rotSpeed;

        // Wrap around boundaries
        if (this.x < -20) this.x = w + 20;
        if (this.x > w + 20) this.x = -20;
        if (this.y < -20) this.y = h + 20;
        if (this.y > h + 20) this.y = -20;

        // Mouse proximity reaction
        if (mouse.active) {
          const dx = mouse.x - this.x;
          const dy = mouse.y - this.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < mouse.radius) {
            const force = (mouse.radius - dist) / mouse.radius;
            const angle = Math.atan2(dy, dx);
            this.x -= Math.cos(angle) * force * 2.6;
            this.y -= Math.sin(angle) * force * 2.6;
            this.opacity = Math.min(0.85, this.baseOpacity + force * 0.65);
            this.size = this.baseSize * (1 + force * 0.5);
          } else {
            this.opacity += (this.baseOpacity - this.opacity) * 0.04;
            this.size += (this.baseSize - this.size) * 0.04;
          }
        } else {
          this.opacity += (this.baseOpacity - this.opacity) * 0.04;
          this.size += (this.baseSize - this.size) * 0.04;
        }
      }

      draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = `rgba(0, 242, 254, ${this.opacity})`;
        
        if (this.opacity > 0.35) {
          ctx.shadowColor = '#00F2FE';
          ctx.shadowBlur = 10;
        }

        // Dibuja el rombo / diamante geométrico
        ctx.beginPath();
        ctx.moveTo(0, -this.size);
        ctx.lineTo(this.size, 0);
        ctx.lineTo(0, this.size);
        ctx.lineTo(-this.size, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
      }
    }

    const resizeCanvas = () => {
      const rect = heroArea.getBoundingClientRect();
      width = canvas.width = rect.width;
      height = canvas.height = rect.height;

      // Densidad equilibrada de partículas
      const count = Math.min(80, Math.max(30, Math.floor((width * height) / 16000)));
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push(new DiamondParticle(width, height));
      }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Mouse Tracking relativo a heroInteractiveArea
    const onMouseMove = (e) => {
      const rect = heroArea.getBoundingClientRect();
      const isInside = (
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom
      );

      if (isInside) {
        mouse.targetX = e.clientX - rect.left;
        mouse.targetY = e.clientY - rect.top;
        mouse.active = true;
      } else {
        mouse.active = false;
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', () => {
      mouse.active = false;
    });

    // Render loop con optimización de visibilidad
    const animate = () => {
      const rect = heroArea.getBoundingClientRect();
      
      // Si la sección está fuera de la pantalla, no consumimos GPU/CPU innecesaria
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        // Interpolación suave del cursor
        mouse.x += (mouse.targetX - mouse.x) * 0.1;
        mouse.y += (mouse.targetY - mouse.y) * 0.1;

        ctx.clearRect(0, 0, width, height);

        // Halo de luz sutil del cursor
        if (mouse.active) {
          const glowGradient = ctx.createRadialGradient(
            mouse.x, mouse.y, 0,
            mouse.x, mouse.y, mouse.radius * 1.3
          );
          glowGradient.addColorStop(0, 'rgba(0, 242, 254, 0.04)');
          glowGradient.addColorStop(1, 'rgba(0, 242, 254, 0)');
          ctx.fillStyle = glowGradient;
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, mouse.radius * 1.3, 0, Math.PI * 2);
          ctx.fill();
        }

        // Renderizado de cada diamante
        for (let i = 0; i < particles.length; i++) {
          particles[i].update(width, height);
          particles[i].draw();
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  // ==========================================================================
  // Store Photo Slider Carousel Logic (Transición tipo diapositiva)
  // ==========================================================================
  const sliderContainer = document.getElementById('heroStoreSlider');
  if (sliderContainer) {
    const slides = sliderContainer.querySelectorAll('.slide-item');
    const dots = sliderContainer.querySelectorAll('.slider-dot');
    let currentSlide = 0;
    let slideInterval = null;
    const slideDuration = 4500; // 4.5 segundos por diapositiva

    const goToSlide = (index) => {
      slides[currentSlide].classList.remove('active');
      dots[currentSlide].classList.remove('active');

      currentSlide = (index + slides.length) % slides.length;

      slides[currentSlide].classList.add('active');
      dots[currentSlide].classList.add('active');
    };

    const nextSlide = () => {
      goToSlide(currentSlide + 1);
    };

    const startAutoplay = () => {
      if (!slideInterval) {
        slideInterval = setInterval(nextSlide, slideDuration);
      }
    };

    const stopAutoplay = () => {
      if (slideInterval) {
        clearInterval(slideInterval);
        slideInterval = null;
      }
    };

    // Dot click events
    dots.forEach((dot, idx) => {
      dot.addEventListener('click', () => {
        stopAutoplay();
        goToSlide(idx);
        startAutoplay();
      });
    });

    // Pause on hover
    sliderContainer.addEventListener('mouseenter', stopAutoplay);
    sliderContainer.addEventListener('mouseleave', startAutoplay);

    // Start auto slide
    startAutoplay();
  }

  // ==========================================================================
  // Animated Favicon (qüem Diéresis Parpadeante via Dynamic Canvas)
  // Permite que Chrome, Edge, Brave y Firefox animen la pestaña activamente
  // ==========================================================================
  const faviconEl = document.getElementById('dynamicFavicon') || document.querySelector("link[rel*='icon']");
  if (faviconEl) {
    const favCanvas = document.createElement('canvas');
    favCanvas.width = 64;
    favCanvas.height = 64;
    const ctx = favCanvas.getContext('2d');

    let frameCount = 0;

    const drawFavicon = () => {
      ctx.clearRect(0, 0, 64, 64);

      // Geometry mapped exactly from the official SVG (viewBox: 0 0 100 160)
      // Scaled to fit 64x64 favicon with optimal padding
      const scale = 0.38;
      const offsetX = (64 - (100 * scale)) / 2; // 13px
      const offsetY = (64 - (160 * scale)) / 2 + 1; // 2px

      // Determinar estado de parpadeo (doble parpadeo realista cada ~3.8s)
      // Ciclo de 32 ticks (cada 120ms => 3.84s por ciclo)
      const tick = frameCount % 32;
      let eyeScaleY = 1.0;
      if (tick === 14 || tick === 17) {
        eyeScaleY = 0.1; // Ojito cerrado/parpadeando
      } else if (tick === 15 || tick === 18) {
        eyeScaleY = 0.5; // Transición
      }

      ctx.save();
      ctx.translate(offsetX, offsetY);
      ctx.scale(scale, scale);

      ctx.fillStyle = '#00F9FF';

      // 1. Ojo Izquierdo
      ctx.save();
      ctx.translate(30, 22);
      ctx.scale(1, eyeScaleY);
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 2. Ojo Derecho
      ctx.save();
      ctx.translate(70, 22);
      ctx.scale(1, eyeScaleY);
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 3. Cuerpo exacto de la "U" (M 20 44 L 20 105 C 20 135, 80 135, 80 105 L 80 44 L 100 44 L 100 105 C 100 155, 0 155, 0 105 L 0 44 Z)
      ctx.beginPath();
      ctx.moveTo(20, 44);
      ctx.lineTo(20, 105);
      ctx.bezierCurveTo(20, 135, 80, 135, 80, 105);
      ctx.lineTo(80, 44);
      ctx.lineTo(100, 44);
      ctx.lineTo(100, 105);
      ctx.bezierCurveTo(100, 155, 0, 155, 0, 105);
      ctx.lineTo(0, 44);
      ctx.closePath();
      ctx.fill();

      ctx.restore();

      // Actualizar favicon en la pestaña
      const newFavicon = document.createElement('link');
      newFavicon.rel = 'icon';
      newFavicon.type = 'image/png';
      newFavicon.href = favCanvas.toDataURL('image/png');

      const existingFav = document.querySelector("link[rel*='icon']");
      if (existingFav) {
        document.head.removeChild(existingFav);
      }
      document.head.appendChild(newFavicon);

      frameCount++;
    };

    // Parpadeo suave a 120ms por tick
    setInterval(drawFavicon, 120);
    drawFavicon();
  }

  // ==========================================================================
  // In-View Icon Dynamic Morphing (IntersectionObserver)
  // Cambia el icono automáticamente cuando la tarjeta entra en el campo de visión
  // ==========================================================================
  const cardsWithIcons = document.querySelectorAll('.card-feature, .space-card');

  if ('IntersectionObserver' in window && cardsWithIcons.length > 0) {
    const observerOptions = {
      root: null,
      threshold: 0.45 // Se activa cuando el 45% de la tarjeta es visible
    };

    const iconObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const card = entry.target;
        const iconWrapper = card.querySelector('.card-icon, .space-icon');
        if (!iconWrapper) return;

        const iconEl = iconWrapper.querySelector('i');
        const altIconClass = iconWrapper.getAttribute('data-alt-icon');

        // Guardamos la clase original si no está guardada
        if (iconEl && !iconWrapper.getAttribute('data-default-icon')) {
          iconWrapper.setAttribute('data-default-icon', iconEl.className);
        }

        const defaultIconClass = iconWrapper.getAttribute('data-default-icon');

        if (entry.isIntersecting) {
          card.classList.add('in-view');

          if (iconEl && altIconClass) {
            // Suave transición de escala y cambio de icono
            iconEl.style.transform = 'scale(0.3) rotate(30deg)';
            iconEl.style.opacity = '0';

            setTimeout(() => {
              iconEl.className = altIconClass;
              iconEl.style.transform = 'scale(1) rotate(0deg)';
              iconEl.style.opacity = '1';
            }, 180);
          }
        } else {
          card.classList.remove('in-view');

          if (iconEl && defaultIconClass) {
            iconEl.style.transform = 'scale(0.3) rotate(-30deg)';
            iconEl.style.opacity = '0';

            setTimeout(() => {
              iconEl.className = defaultIconClass;
              iconEl.style.transform = 'scale(1) rotate(0deg)';
              iconEl.style.opacity = '1';
            }, 180);
          }
        }
      });
    }, observerOptions);

    cardsWithIcons.forEach((card) => iconObserver.observe(card));
  }
});


