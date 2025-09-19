// Wait until libraries are loaded
    window.addEventListener('load', () => {
      const stage = document.getElementById('stage');
      const bookEl = document.getElementById('book');
      const placeholder = document.getElementById('placeholder');
      const progressBar = document.getElementById('progress');
      const stats = document.getElementById('stats');
      const nav = document.getElementById('nav');
      const pageLabel = document.getElementById('pageLabel');
      const pdfUrlInput = document.getElementById('pdfUrl');

      const loadUrlBtn = document.getElementById('loadUrlBtn');
      const fileInput = document.getElementById('pdfFile');
      const prevBtn = document.getElementById('prevBtn');
      const nextBtn = document.getElementById('nextBtn');
      const fsBtn = document.getElementById('fsBtn');

      // Configure PDF.js worker
      if (window['pdfjsLib']) {
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
      }

      let pageFlip = null;
      let totalPages = 0;

      function setLoading(pct, text = '') {
        progressBar.style.width = (pct * 100).toFixed(1) + '%';
        stats.textContent = text;
      }

      function showBookUI(show) {
        bookEl.classList.toggle('hidden', !show);
        nav.classList.toggle('hidden', !show);
        placeholder.classList.toggle('hidden', show);
      }

      function updatePageLabel() {
        if (!pageFlip) return;
        const state = pageFlip.getState(); // {page, pages, ...}
        pageLabel.textContent = `${state.page + 1} / ${state.pages}`;
      }

      // Render a PDF to array of data-URLs (images)
      async function pdfToImages(pdfData) {
        const pdf = await pdfjsLib.getDocument(pdfData).promise;
        const images = [];
        totalPages = pdf.numPages;

        // Target width for quality; auto height by scale
        const targetWidth = Math.min(stage.clientWidth * 0.95, 1400);

        for (let i = 1; i <= pdf.numPages; i++) {
          setLoading(i / (pdf.numPages + 1), `Rendering page ${i} of ${pdf.numPages}…`);
          const page = await pdf.getPage(i);

          const viewport = page.getViewport({ scale: 1.0 });
          const scale = targetWidth / viewport.width;
          const scaledViewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: false });
          canvas.width = Math.floor(scaledViewport.width);
          canvas.height = Math.floor(scaledViewport.height);

          await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
          images.push(canvas.toDataURL('image/jpeg', 0.9));
        }
        setLoading(1, 'Preparing flipbook…');
        return images;
      }

      // Initialize / reload the PageFlip with given images
      function initFlipbook(imageUrls) {
        // Reset previous instance
        if (pageFlip) {
          pageFlip.destroy();
          pageFlip = null;
        }

        showBookUI(true);

        // Create PageFlip
        pageFlip = new St.PageFlip(bookEl, {
          width: Math.min(800, stage.clientWidth * 0.48),  // single page width
          height: Math.min(1100, stage.clientHeight * 0.9),
          size: 'stretch',          // responsive
          minWidth: 320,
          maxWidth: 2000,
          minHeight: 420,
          maxHeight: 2500,
          drawShadow: true,
          flippingTime: 600,
          showCover: true,
          usePortrait: true,
          mobileScrollSupport: true,
          startZIndex: 2
        });

        // PageFlip can load from image URLs (data URLs work)
        pageFlip.loadFromImages(imageUrls);

        pageFlip.on('flip', updatePageLabel);
        pageFlip.on('changeState', updatePageLabel);

        updatePageLabel();
        setLoading(1, `Loaded ${imageUrls.length} page(s).`);
        // Small delay to clear progress bar
        setTimeout(() => setLoading(0, ''), 600);
      }

      // Read a File object into ArrayBuffer
      function fileToArrayBuffer(file) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(new Uint8Array(reader.result));
          reader.onerror = reject;
          reader.readAsArrayBuffer(file);
        });
      }

      // Load from local file
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          setLoading(0.05, `Reading ${file.name}…`);
          const data = await fileToArrayBuffer(file);
          const images = await pdfToImages({ data });
          initFlipbook(images);
        } catch (err) {
          console.error(err);
          alert('Failed to open this PDF. See console for details.');
          setLoading(0, '');
        }
      });

      // Load from URL
      loadUrlBtn.addEventListener('click', async () => {
        const url = pdfUrlInput.value.trim();
        if (!url) {
          alert('Please paste a direct link to a PDF first.');
          return;
        }
        try {
          setLoading(0.05, 'Fetching PDF…');
          // PDF.js can fetch by URL (CORS must be allowed by the server)
          const images = await pdfToImages({ url });
          initFlipbook(images);
        } catch (err) {
          console.error(err);
          alert('Failed to load PDF from URL (CORS blocked or invalid). Try downloading the PDF and using "Choose PDF…".');
          setLoading(0, '');
        }
      });

      // Navigation
      prevBtn.addEventListener('click', () => pageFlip && pageFlip.flipPrev());
      nextBtn.addEventListener('click', () => pageFlip && pageFlip.flipNext());
      document.addEventListener('keydown', (e) => {
        if (!pageFlip) return;
        if (e.key === 'ArrowLeft') pageFlip.flipPrev();
        if (e.key === 'ArrowRight') pageFlip.flipNext();
      });

      // Fullscreen toggle
      fsBtn.addEventListener('click', async () => {
        try {
          if (!document.fullscreenElement) {
            await stage.requestFullscreen();
          } else {
            await document.exitFullscreen();
          }
        } catch (e) {
          console.warn('Fullscreen not available', e);
        }
      });

      // Resize handling – keep book sized nicely
      window.addEventListener('resize', () => {
        if (!pageFlip) return;
        // Re-create to fit new container size
        // Grab current page to restore
        const current = pageFlip.getCurrentPageIndex?.() ?? 0;
        const pages = pageFlip?.pages?.map?.(p => p?.image?.src).filter(Boolean) || [];
        if (pages.length) {
          initFlipbook(pages);
          // Jump back close to where the user was
          setTimeout(() => pageFlip.flip(current), 0);
        }
      });
    });