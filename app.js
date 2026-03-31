// PDF.js worker configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

class PDFReader {
    constructor() {
        this.pdfText = '';
        this.sentences = [];
        this.currentSentenceIndex = 0;
        this.synthesis = window.speechSynthesis;
        this.currentUtterance = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.voices = [];
        this.pdf = null;
        this.pageSentenceMap = []; // Map page numbers to sentence indices
        this.outline = [];

        this.initializeElements();
        this.initializeEventListeners();
        this.loadVoices();
    }

    initializeElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.contentSection = document.getElementById('contentSection');
        this.loading = document.getElementById('loading');
        this.fileName = document.getElementById('fileName');
        this.pageCount = document.getElementById('pageCount');
        this.textPreview = document.getElementById('textPreview');
        this.voiceSelect = document.getElementById('voiceSelect');
        this.rateRange = document.getElementById('rateRange');
        this.rateValue = document.getElementById('rateValue');
        this.pitchRange = document.getElementById('pitchRange');
        this.pitchValue = document.getElementById('pitchValue');
        this.playBtn = document.getElementById('playBtn');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.rewindBtn = document.getElementById('rewindBtn');
        this.forwardBtn = document.getElementById('forwardBtn');
        this.currentSection = document.getElementById('currentSection');
        this.progressBar = document.getElementById('progressBar');
        this.outlineTree = document.getElementById('outlineTree');
        this.toggleSidebar = document.getElementById('toggleSidebar');
        this.showSidebarBtn = document.getElementById('showSidebarBtn');
    }

    initializeEventListeners() {
        // File upload events
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // Drag and drop events
        this.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.uploadArea.classList.add('dragover');
        });

        this.uploadArea.addEventListener('dragleave', () => {
            this.uploadArea.classList.remove('dragover');
        });

        this.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.uploadArea.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type === 'application/pdf') {
                this.processPDF(file);
            }
        });

        // Control events
        this.playBtn.addEventListener('click', () => this.play());
        this.pauseBtn.addEventListener('click', () => this.pause());
        this.stopBtn.addEventListener('click', () => this.stop());
        this.rewindBtn.addEventListener('click', () => this.rewind());
        this.forwardBtn.addEventListener('click', () => this.forward());
        this.toggleSidebar.addEventListener('click', () => this.toggleSidebarView());
        this.showSidebarBtn.addEventListener('click', () => this.toggleSidebarView());

        this.rateRange.addEventListener('input', (e) => {
            this.rateValue.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
        });

        this.pitchRange.addEventListener('input', (e) => {
            this.pitchValue.textContent = parseFloat(e.target.value).toFixed(1);
        });

        // Load voices when they change
        if (this.synthesis.onvoiceschanged !== undefined) {
            this.synthesis.onvoiceschanged = () => this.loadVoices();
        }
    }

    loadVoices() {
        this.voices = this.synthesis.getVoices();
        this.voiceSelect.innerHTML = '';

        // Filter and sort voices (prefer Chinese and English)
        const preferredVoices = this.voices.filter(voice =>
            voice.lang.startsWith('zh') || voice.lang.startsWith('en')
        ).sort((a, b) => {
            if (a.lang.startsWith('zh') && !b.lang.startsWith('zh')) return -1;
            if (!a.lang.startsWith('zh') && b.lang.startsWith('zh')) return 1;
            return 0;
        });

        const voicesToShow = preferredVoices.length > 0 ? preferredVoices : this.voices;

        voicesToShow.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            this.voiceSelect.appendChild(option);
        });
    }

    async handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            await this.processPDF(file);
        }
    }

    async processPDF(file) {
        this.loading.style.display = 'block';
        this.contentSection.style.display = 'none';
        this.uploadArea.parentElement.style.display = 'none';

        try {
            const arrayBuffer = await file.arrayBuffer();
            this.pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

            this.fileName.textContent = file.name;
            this.pageCount.textContent = `页数: ${this.pdf.numPages}`;

            // Extract outline (table of contents)
            await this.loadOutline();

            // Extract text from all pages and build page->sentence mapping
            let fullText = '';
            this.pageSentenceMap = [];
            let sentenceIndex = 0;

            for (let i = 1; i <= this.pdf.numPages; i++) {
                const page = await this.pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n\n';

                // Record which sentence starts this page
                this.pageSentenceMap[i] = sentenceIndex;

                // Count sentences on this page
                const pageSentences = this.splitIntoSentences(pageText);
                sentenceIndex += pageSentences.length;
            }

            this.pdfText = fullText.trim();
            this.sentences = this.splitIntoSentences(this.pdfText);
            this.currentSentenceIndex = 0;

            // Show preview (first 2000 characters)
            this.textPreview.textContent = this.pdfText.substring(0, 2000) +
                (this.pdfText.length > 2000 ? '\n\n...(更多内容)' : '');

            this.loading.style.display = 'none';
            this.contentSection.style.display = 'block';
            this.updateProgress();

        } catch (error) {
            console.error('Error processing PDF:', error);
            alert('处理PDF文件时出错: ' + error.message);
            this.loading.style.display = 'none';
            this.uploadArea.parentElement.style.display = 'block';
        }
    }

    splitIntoSentences(text) {
        // Split text into sentences for better reading experience
        // This regex handles Chinese and English sentence boundaries
        const sentences = [];
        const regex = /[^。！？.!?]+[。！？.!?]?\s*/g;
        let match;

        while ((match = regex.exec(text)) !== null) {
            const sentence = match[0].trim();
            if (sentence.length > 0) {
                sentences.push(sentence);
            }
        }

        // If no sentences found, split by paragraphs
        if (sentences.length === 0) {
            return text.split('\n').filter(s => s.trim().length > 0);
        }

        return sentences;
    }

    play() {
        if (this.isPaused) {
            this.synthesis.resume();
            this.isPaused = false;
            this.isPlaying = true;
            this.updateButtons();
            return;
        }

        if (this.currentSentenceIndex >= this.sentences.length) {
            this.currentSentenceIndex = 0;
        }

        this.speakNextSentence();
    }

    speakNextSentence() {
        if (this.currentSentenceIndex >= this.sentences.length) {
            this.stop();
            this.currentSection.textContent = '朗读完成';
            return;
        }

        const text = this.sentences[this.currentSentenceIndex];
        const utterance = new SpeechSynthesisUtterance(text);

        // Set voice and parameters
        const selectedVoiceName = this.voiceSelect.value;
        const selectedVoice = this.voices.find(v => v.name === selectedVoiceName);
        if (selectedVoice) {
            utterance.voice = selectedVoice;
        }

        utterance.rate = parseFloat(this.rateRange.value);
        utterance.pitch = parseFloat(this.pitchRange.value);

        utterance.onend = () => {
            if (this.isPlaying && !this.isPaused) {
                this.currentSentenceIndex++;
                this.updateProgress();
                this.speakNextSentence();
            }
        };

        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            if (event.error !== 'interrupted' && event.error !== 'canceled') {
                this.stop();
            }
        };

        this.currentUtterance = utterance;
        this.synthesis.speak(utterance);
        this.isPlaying = true;
        this.updateButtons();
    }

    pause() {
        if (this.isPlaying && !this.isPaused) {
            this.synthesis.pause();
            this.isPaused = true;
            this.updateButtons();
        }
    }

    stop() {
        this.synthesis.cancel();
        this.isPlaying = false;
        this.isPaused = false;
        this.currentSentenceIndex = 0;
        this.updateProgress();
        this.updateButtons();
    }

    rewind() {
        // Go back 5 sentences
        const jumpAmount = 5;
        this.currentSentenceIndex = Math.max(0, this.currentSentenceIndex - jumpAmount);

        // If currently playing, restart from new position
        if (this.isPlaying) {
            this.synthesis.cancel();
            if (this.isPaused) {
                this.isPaused = false;
            }
            this.speakNextSentence();
        } else {
            this.updateProgress();
        }
    }

    forward() {
        // Skip forward 5 sentences
        const jumpAmount = 5;
        this.currentSentenceIndex = Math.min(this.sentences.length - 1, this.currentSentenceIndex + jumpAmount);

        // If currently playing, skip to new position
        if (this.isPlaying) {
            this.synthesis.cancel();
            if (this.isPaused) {
                this.isPaused = false;
            }
            this.speakNextSentence();
        } else {
            this.updateProgress();
        }
    }

    async loadOutline() {
        try {
            const outline = await this.pdf.getOutline();
            this.outlineTree.innerHTML = '';

            if (!outline || outline.length === 0) {
                this.outlineTree.innerHTML = '<p class="no-outline">此PDF没有目录</p>';
                return;
            }

            // Render outline tree
            outline.forEach((item, index) => {
                const outlineItem = this.createOutlineItem(item, index);
                this.outlineTree.appendChild(outlineItem);
            });
        } catch (error) {
            console.error('Error loading outline:', error);
            this.outlineTree.innerHTML = '<p class="no-outline">无法加载目录</p>';
        }
    }

    createOutlineItem(item, index) {
        const container = document.createElement('div');

        const itemDiv = document.createElement('div');
        itemDiv.className = 'outline-item';
        itemDiv.dataset.index = index;

        const title = document.createElement('span');
        title.className = 'outline-item-title';
        title.textContent = item.title;
        itemDiv.appendChild(title);

        // Add page number if available
        if (item.dest) {
            const pageSpan = document.createElement('span');
            pageSpan.className = 'outline-item-page';

            // Get page number from destination
            let pageNum = null;
            if (typeof item.dest === 'string') {
                // Named destination - need to resolve it
                this.pdf.getDestination(item.dest).then(dest => {
                    if (dest && dest[0]) {
                        dest[0].getPageIndex().then(idx => {
                            pageSpan.textContent = `(第 ${idx + 1} 页)`;
                        });
                    }
                });
            } else if (Array.isArray(item.dest) && item.dest[0]) {
                // Array destination
                item.dest[0].getPageIndex().then(idx => {
                    pageSpan.textContent = `(第 ${idx + 1} 页)`;
                    itemDiv.dataset.pageIndex = idx;
                });
            }

            itemDiv.appendChild(pageSpan);

            // Click handler
            itemDiv.addEventListener('click', () => {
                if (itemDiv.dataset.pageIndex !== undefined) {
                    const pageIndex = parseInt(itemDiv.dataset.pageIndex);
                    this.jumpToPage(pageIndex);

                    // Update active state
                    document.querySelectorAll('.outline-item').forEach(el => el.classList.remove('active'));
                    itemDiv.classList.add('active');
                }
            });
        }

        container.appendChild(itemDiv);

        // Add children if any
        if (item.items && item.items.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'outline-children';
            item.items.forEach((childItem, childIndex) => {
                const childElement = this.createOutlineItem(childItem, `${index}-${childIndex}`);
                childrenContainer.appendChild(childElement);
            });
            container.appendChild(childrenContainer);
        }

        return container;
    }

    async jumpToPage(pageIndex) {
        // Find the sentence index for this page
        const sentenceIndex = this.pageSentenceMap[pageIndex + 1];
        if (sentenceIndex !== undefined) {
            this.currentSentenceIndex = sentenceIndex;

            // Stop current playback and start from new position
            if (this.isPlaying || this.isPaused) {
                this.synthesis.cancel();
                this.isPaused = false;
            }

            this.isPlaying = true;
            this.speakNextSentence();
            this.updateProgress();
        }
    }

    toggleSidebarView() {
        const sidebar = document.querySelector('.sidebar');
        const outlineTree = document.querySelector('.outline-tree');

        sidebar.classList.toggle('collapsed');
        outlineTree.classList.toggle('collapsed');

        // Update button icon and show/hide floating button
        if (sidebar.classList.contains('collapsed')) {
            this.toggleSidebar.textContent = '▶';
            this.showSidebarBtn.style.display = 'block';
        } else {
            this.toggleSidebar.textContent = '◀';
            this.showSidebarBtn.style.display = 'none';
        }
    }

    updateButtons() {
        this.playBtn.disabled = this.isPlaying && !this.isPaused;
        this.pauseBtn.disabled = !this.isPlaying || this.isPaused;
        this.stopBtn.disabled = !this.isPlaying && !this.isPaused;

        // Enable rewind/forward buttons when we have content
        const hasContent = this.sentences.length > 0;
        this.rewindBtn.disabled = !hasContent;
        this.forwardBtn.disabled = !hasContent;

        if (this.isPaused) {
            this.playBtn.innerHTML = '<span class="btn-icon">▶</span> 继续';
        } else {
            this.playBtn.innerHTML = '<span class="btn-icon">▶</span> 播放';
        }
    }

    updateProgress() {
        const total = this.sentences.length;
        const current = this.currentSentenceIndex;
        const percentage = total > 0 ? (current / total * 100) : 0;

        this.progressBar.style.width = percentage + '%';

        if (current === 0 && total > 0) {
            this.currentSection.textContent = `准备就绪 (共 ${total} 段)`;
        } else if (current >= total) {
            this.currentSection.textContent = '朗读完成';
        } else {
            this.currentSection.textContent = `正在朗读第 ${current + 1} / ${total} 段`;
        }
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new PDFReader();
});
