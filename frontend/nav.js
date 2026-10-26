/**
 * nav.js - Shared Navigation and Interaction Controller
 * Handles active line movement, hover gliding, mobile overlay menu,
 * page transitions, and background grain noise.
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Background Grain Noise ---
    const initNoise = () => {
        const canvas = document.getElementById('noise');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        let wWidth = window.innerWidth;
        let wHeight = window.innerHeight;
        canvas.width = wWidth;
        canvas.height = wHeight;
        
        const noiseData = [];
        let frame = 0;
        
        for (let i = 0; i < 8; i++) {
            const idata = ctx.createImageData(wWidth, wHeight);
            const buffer32 = new Uint32Array(idata.data.buffer);
            const len = buffer32.length;
            for (let j = 0; j < len; j++) {
                if (Math.random() < 0.08) {
                    buffer32[j] = 0xffffffff;
                }
            }
            noiseData.push(idata);
        }
        
        const renderLoop = () => {
            frame = (frame + 1) % 8;
            ctx.putImageData(noiseData[frame], 0, 0);
            setTimeout(() => {
                requestAnimationFrame(renderLoop);
            }, 60);
        };
        
        renderLoop();
        
        window.addEventListener('resize', () => {
            wWidth = window.innerWidth;
            wHeight = window.innerHeight;
            canvas.width = wWidth;
            canvas.height = wHeight;
        });
    };
    initNoise();

    // --- 2. Active Page Detection & Sliding Underline Bar ---
    const navMenu = document.querySelector('.nav__menu');
    const navLine = document.querySelector('.nav__line');
    const navLinks = document.querySelectorAll('.nav__link');

    // Determine current page from URL
    const pathname = window.location.pathname.toLowerCase();
    let activeLink = null;

    navLinks.forEach(link => {
        const href = (link.getAttribute('href') || '').toLowerCase();
        if (
            (pathname.endsWith('monitor.html') || pathname.endsWith('/monitor')) && href.includes('monitor') ||
            (pathname.endsWith('decision.html') || pathname.endsWith('/decision')) && href.includes('decision') ||
            (pathname.endsWith('model.html') || pathname.endsWith('/model')) && href.includes('model') ||
            (pathname.endsWith('validation.html') || pathname.endsWith('/validation')) && href.includes('validation') ||
            ((pathname === '/' || pathname.endsWith('index.html') || pathname === '') && (href === '/' || href.includes('index.html')))
        ) {
            link.classList.add('w--current');
            activeLink = link;
        } else {
            link.classList.remove('w--current');
        }
    });

    // Fallback to first link (Home) if not matched
    if (!activeLink && navLinks.length > 0) {
        activeLink = navLinks[0];
        activeLink.classList.add('w--current');
    }

    const moveLine = (targetLink) => {
        if (!navLine || !navMenu || !targetLink) return;
        const textElement = targetLink.querySelector('.nav__link-text') || targetLink;
        const menuRect = navMenu.getBoundingClientRect();
        const textRect = textElement.getBoundingClientRect();

        const distance = textRect.left - menuRect.left;
        const width = textRect.width;
        const color = targetLink.getAttribute('data-color') || '#f88cd4';

        navLine.style.backgroundColor = color;
        navLine.style.width = `${width}px`;
        navLine.style.transform = `translateX(${distance}px)`;
        navLine.style.opacity = '1';
    };

    // Position line on load
    if (activeLink) {
        setTimeout(() => {
            moveLine(activeLink);
        }, 100);
    }

    // Hover Gliding
    navLinks.forEach(link => {
        link.addEventListener('mouseenter', () => {
            moveLine(link);
        });
    });

    if (navMenu) {
        navMenu.addEventListener('mouseleave', () => {
            if (activeLink) {
                moveLine(activeLink);
            } else if (navLine) {
                navLine.style.width = '0px';
                navLine.style.opacity = '0';
            }
        });
    }

    window.addEventListener('resize', () => {
        if (activeLink) moveLine(activeLink);
    });

    // --- 3. Hamburger Icon & Full-Screen Glass Menu Overlay ---
    const navIcon = document.querySelector('.nav__icon');
    const overlay = document.querySelector('.nav__overlay');
    const overlayClose = document.querySelector('.nav__overlay-close');
    const overlayLinks = document.querySelectorAll('.nav__overlay-link');

    if (navIcon && overlay) {
        navIcon.addEventListener('click', (e) => {
            e.preventDefault();
            const isOpen = overlay.classList.toggle('is--open');
            navIcon.classList.toggle('is--active', isOpen);
            document.body.style.overflow = isOpen ? 'hidden' : '';
        });

        if (overlayClose) {
            overlayClose.addEventListener('click', () => {
                overlay.classList.remove('is--open');
                navIcon.classList.remove('is--active');
                document.body.style.overflow = '';
            });
        }

        overlayLinks.forEach(link => {
            link.addEventListener('click', () => {
                overlay.classList.remove('is--open');
                navIcon.classList.remove('is--active');
                document.body.style.overflow = '';
            });
        });
    }

    // --- 4. Page Transition Animation ---
    document.body.classList.add('page-loaded');

    document.querySelectorAll('a').forEach(anchor => {
        const href = anchor.getAttribute('href');
        if (href && !href.startsWith('#') && !href.startsWith('http') && !anchor.getAttribute('target')) {
            anchor.addEventListener('click', (e) => {
                e.preventDefault();
                document.body.classList.remove('page-loaded');
                document.body.classList.add('page-exiting');
                setTimeout(() => {
                    window.location.href = href;
                }, 220);
            });
        }
    });
});
