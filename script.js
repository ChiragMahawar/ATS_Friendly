/* ===== ATS Pro — Enhanced with Real Analysis Engine ===== */
(function () {
    'use strict';

    // pdf.js worker
    if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    /* ---------- DOM REFS ---------- */
    const navBtns = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');
    const dropZone = document.getElementById('dropZone');
    const resumeUpload = document.getElementById('resumeUpload');
    const uploadBtn = document.getElementById('uploadBtn');
    const analyzingState = document.getElementById('analyzingState');
    const resultsArea = document.getElementById('resultsArea');
    const fixResumeBtn = document.getElementById('fixResumeBtn');
    const checkAnotherBtn = document.getElementById('checkAnotherBtn');
    const scoreRingFill = document.getElementById('scoreRingFill');
    const atsScoreText = document.getElementById('atsScoreText');
    const scoreTitle = document.getElementById('scoreTitle');
    const scoreDesc = document.getElementById('scoreDesc');
    const feedbackGrid = document.getElementById('feedbackGrid');
    const progressFill = document.getElementById('progressFill');
    const analyzeStep = document.getElementById('analyzeStep');
    const fileNameEl = document.getElementById('fileName');
    const compareBeforeBar = document.getElementById('compareBeforeBar');
    const compareAfterBar = document.getElementById('compareAfterBar');
    const compareBeforeVal = document.getElementById('compareBeforeVal');
    const compareAfterVal = document.getElementById('compareAfterVal');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const downloadDocBtn = document.getElementById('downloadDocBtn');
    const addExperienceBtn = document.getElementById('addExperienceBtn');
    const addInternshipBtn = document.getElementById('addInternshipBtn');
    const addEducationBtn = document.getElementById('addEducationBtn');
    const addProjectBtn = document.getElementById('addProjectBtn');
    const addCertBtn = document.getElementById('addCertBtn');
    const resumePreview = document.getElementById('resumePreviewOutput');
    const ctaCheckBtn = document.getElementById('ctaCheckBtn');
    const ctaBuildBtn = document.getElementById('ctaBuildBtn');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const navLinks = document.getElementById('navLinks');


    let lastParsedResume = null; // Store parsed resume for Auto-Fix

    /* ---------- INTERSECTION OBSERVER ---------- */
    const obs = new IntersectionObserver(e => e.forEach(en => {
        if (en.isIntersecting) { en.target.classList.add('animate-in'); obs.unobserve(en.target); }
    }), { threshold: 0.15 });
    function observeAnim() {
        document.querySelectorAll('[data-animate]').forEach(el => { el.classList.remove('animate-in'); obs.observe(el); });
    }
    observeAnim();

    /* ---------- PARALLAX ---------- */
    const orbs = document.querySelectorAll('.parallax-orb');
    document.addEventListener('mousemove', e => {
        const cx = e.clientX / window.innerWidth - 0.5, cy = e.clientY / window.innerHeight - 0.5;
        orbs.forEach((o, i) => { o.style.transform = `translate(${cx * (i + 1) * 15}px, ${cy * (i + 1) * 15}px)`; });
    });

    /* ---------- TOAST ---------- */
    function toast(msg, type = 'info') {
        const c = document.getElementById('toastContainer'), el = document.createElement('div');
        el.className = `toast ${type}`;
        el.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-info'}"></i> ${msg}`;
        c.appendChild(el); setTimeout(() => el.remove(), 3200);
    }

    /* ---------- NAVIGATION ---------- */
    function switchView(t) {
        navBtns.forEach(b => b.classList.remove('active'));
        document.querySelector(`.nav-btn[data-target="${t}"]`).classList.add('active');
        views.forEach(v => { v.classList.remove('active-view'); v.classList.add('hidden-view'); });
        document.getElementById(t).classList.remove('hidden-view');
        document.getElementById(t).classList.add('active-view');
        if (t === 'builderView') renderPreview();
        navLinks.classList.remove('open'); hamburgerBtn.classList.remove('open');
        setTimeout(observeAnim, 50);
    }
    navBtns.forEach(b => b.addEventListener('click', () => switchView(b.dataset.target)));
    document.querySelectorAll('.footer-link').forEach(b => b.addEventListener('click', () => { switchView(b.dataset.target); window.scrollTo({ top: 0, behavior: 'smooth' }); }));
    ctaCheckBtn.addEventListener('click', () => { switchView('checkerView'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    ctaBuildBtn.addEventListener('click', () => { switchView('builderView'); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    hamburgerBtn.addEventListener('click', () => { hamburgerBtn.classList.toggle('open'); navLinks.classList.toggle('open'); });

    /* ---------- ACCORDION ---------- */
    document.querySelectorAll('.accordion-btn').forEach(b => b.addEventListener('click', () => b.parentElement.classList.toggle('active')));

    /* ---------- DELETE ENTRIES ---------- */
    document.querySelector('.builder-controls').addEventListener('click', e => {
        const d = e.target.closest('.delete-entry-btn'); if (!d) return;
        const card = d.closest('.form-card'), p = card.parentElement;
        if (p.children.length <= 1) { toast('Need at least one entry.', 'info'); return; }
        card.style.cssText = 'opacity:0;transform:translateX(-20px);transition:0.3s';
        setTimeout(() => { card.remove(); renderPreview(); }, 300);
    });

    /* ═══════════════════════════════════════════
       TEXT EXTRACTION ENGINE
       Returns { text, isSelectable, totalItems, isPdf }
       ═══════════════════════════════════════════ */
    async function extractText(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'txt') {
            const t = await file.text();
            return { text: t, isSelectable: true, totalItems: t.split(/\s+/).length, isPdf: false };
        }
        if (ext === 'pdf' && window.pdfjsLib) {
            const buf = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
            let text = '', totalItems = 0;
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const items = content.items.filter(it => it.str !== undefined);
                totalItems += items.filter(it => it.str.trim().length > 0).length;
                // Use Y-coordinate from transform matrix to detect line breaks
                // transform[5] = Y position (inverted: higher Y = higher on page)
                let lastY = null;
                let lineText = '';
                for (const item of items) {
                    const y = item.transform ? item.transform[5] : null;
                    if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) {
                        // Y changed = new line in the PDF
                        text += lineText.trim() + '\n';
                        lineText = '';
                    }
                    lineText += item.str + ' ';
                    if (y !== null) lastY = y;
                }
                if (lineText.trim()) text += lineText.trim() + '\n';
                text += '\n'; // page break
            }
            // A PDF with selectable text will have many individual text items
            // (each word/phrase is a separate item). Image-based PDFs have 0 or very few.
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const isSelectable = totalItems >= 10 && wordCount >= 20;
            return { text, isSelectable, totalItems, isPdf: true, wordCount };
        }
        // doc/docx — try reading as text
        const t = await file.text();
        return { text: t, isSelectable: true, totalItems: t.split(/\s+/).length, isPdf: false };
    }

    /* ═══════════════════════════════════════════
       DETERMINISTIC ATS ANALYSIS ENGINE
       ═══════════════════════════════════════════ */
    const ACTION_VERBS = ['led', 'managed', 'developed', 'built', 'created', 'designed', 'implemented', 'launched', 'increased', 'decreased', 'reduced', 'improved', 'optimized', 'delivered', 'achieved', 'established', 'negotiated', 'coordinated', 'spearheaded', 'streamlined', 'automated', 'mentored', 'architected', 'orchestrated', 'executed', 'analyzed', 'resolved', 'transformed', 'accelerated', 'generated', 'maintained', 'supervised', 'trained', 'collaborated'];
    const SECTION_HEADINGS = {
        summary: /\b(summary|objective|profile|about)\b/i,
        experience: /\b(experience|employment|work\s*history|professional\s*experience)\b/i,
        education: /\b(education|academic|qualification|degree)\b/i,
        skills: /\b(skills|competenc|technical|technologies|proficienc)\b/i,
        projects: /\b(project|portfolio)\b/i,
        certifications: /\b(certif|license|accredit)\b/i,
    };

    function analyzeResume(text, extractionResult) {
        const lower = text.toLowerCase();
        const words = text.split(/\s+/).filter(Boolean);
        const wordCount = words.length;
        const lines = text.split('\n').filter(l => l.trim());
        const results = [];
        const isSelectable = extractionResult ? extractionResult.isSelectable : true;
        const isPdf = extractionResult ? extractionResult.isPdf : false;

        // ★ GATING CHECK: Text Selectability (must pass before other checks count)
        const selectScore = isSelectable ? 15 : 0;
        const selectDesc = isSelectable
            ? (isPdf ? `PDF text is selectable — ${extractionResult.totalItems} individual text elements detected. ATS can parse this document.`
                : 'Text file format — all content is selectable by default.')
            : `PDF text is NOT selectable — only ${extractionResult ? extractionResult.totalItems : 0} text elements found. This appears to be a scanned/image-based PDF that ATS cannot read.`;
        results.push({
            id: 'selectable', title: '★ Text Selectability', score: selectScore, max: 15,
            type: isSelectable ? 'good' : 'bad',
            icon: isSelectable ? 'fa-check' : 'fa-xmark',
            desc: selectDesc,
            gating: true
        });

        // If text is NOT selectable, all remaining checks score 0
        const gate = isSelectable ? 1 : 0;

        // 1. Contact Info (10 pts)
        const hasEmail = /[\w.-]+@[\w.-]+\.\w{2,}/.test(text);
        const hasPhone = /[\(]?\d{3}[\)\s.-]?\s?\d{3}[\s.-]?\d{4}/.test(text) || /\+?\d[\d\s.-]{8,}/.test(text);
        const contactScore = ((hasEmail ? 5 : 0) + (hasPhone ? 5 : 0)) * gate;
        results.push({
            id: 'contact', title: 'Contact Information', score: contactScore, max: 10,
            type: !gate ? 'bad' : contactScore >= 8 ? 'good' : contactScore >= 5 ? 'warning' : 'bad',
            icon: !gate ? 'fa-xmark' : contactScore >= 8 ? 'fa-check' : contactScore >= 5 ? 'fa-triangle-exclamation' : 'fa-xmark',
            desc: !gate ? 'Skipped — text not selectable.' : contactScore >= 8 ? 'Email and phone number detected.' : hasEmail ? 'Email found but phone number may be missing.' : 'Missing email and/or phone — add clear contact info.'
        });

        // 2. Summary Section (10 pts)
        const hasSummary = SECTION_HEADINGS.summary.test(text);
        const summaryScore = (hasSummary ? 10 : 0) * gate;
        results.push({
            id: 'summary', title: 'Professional Summary', score: summaryScore, max: 10,
            type: !gate ? 'bad' : hasSummary ? 'good' : 'bad', icon: !gate ? 'fa-xmark' : hasSummary ? 'fa-check' : 'fa-xmark',
            desc: !gate ? 'Skipped — text not selectable.' : hasSummary ? 'Professional summary/objective section found.' : 'No summary section found. Add a 2-3 sentence professional overview.'
        });

        // 3. Experience Section (12 pts)
        const hasExp = SECTION_HEADINGS.experience.test(text);
        const expScore = (hasExp ? 12 : 0) * gate;
        results.push({
            id: 'experience', title: 'Work Experience', score: expScore, max: 12,
            type: !gate ? 'bad' : hasExp ? 'good' : 'bad', icon: !gate ? 'fa-xmark' : hasExp ? 'fa-check' : 'fa-xmark',
            desc: !gate ? 'Skipped — text not selectable.' : hasExp ? 'Work experience section detected.' : 'No experience section found — ATS may reject this resume.'
        });

        // 4. Education Section (10 pts)
        const hasEdu = SECTION_HEADINGS.education.test(text);
        const eduScore = (hasEdu ? 10 : 0) * gate;
        results.push({
            id: 'education', title: 'Education', score: eduScore, max: 10,
            type: !gate ? 'bad' : hasEdu ? 'good' : 'warning', icon: !gate ? 'fa-xmark' : hasEdu ? 'fa-check' : 'fa-triangle-exclamation',
            desc: !gate ? 'Skipped — text not selectable.' : hasEdu ? 'Education section found.' : 'No education section detected. Most ATS expect one.'
        });

        // 5. Skills Section (10 pts)
        const hasSkills = SECTION_HEADINGS.skills.test(text);
        const skillWords = lower.match(/\b(javascript|python|java|react|node|sql|aws|docker|git|html|css|typescript|c\+\+|ruby|go|kubernetes|linux|agile|scrum|tableau|excel|figma|photoshop|machine\s*learning|data\s*analysis|project\s*management)\b/gi) || [];
        const uniqueSkills = new Set(skillWords.map(s => s.toLowerCase()));
        const rawSkill = hasSkills ? (uniqueSkills.size >= 5 ? 10 : uniqueSkills.size >= 3 ? 7 : 4) : (uniqueSkills.size >= 3 ? 5 : 0);
        const skillScore = rawSkill * gate;
        results.push({
            id: 'skills', title: 'Skills Section', score: skillScore, max: 10,
            type: !gate ? 'bad' : skillScore >= 8 ? 'good' : skillScore >= 4 ? 'warning' : 'bad',
            icon: !gate ? 'fa-xmark' : skillScore >= 8 ? 'fa-check' : skillScore >= 4 ? 'fa-triangle-exclamation' : 'fa-xmark',
            desc: !gate ? 'Skipped — text not selectable.' : skillScore >= 8 ? `Skills section with ${uniqueSkills.size} recognized skills.` : skillScore >= 4 ? 'Skills detected but section heading may be non-standard.' : 'No skills section found. Add a dedicated "Skills" section.'
        });

        // 6. Action Verbs (10 pts)
        const verbsFound = ACTION_VERBS.filter(v => lower.includes(v));
        const rawVerb = verbsFound.length >= 8 ? 10 : verbsFound.length >= 5 ? 7 : verbsFound.length >= 2 ? 4 : 0;
        const verbScore = rawVerb * gate;
        results.push({
            id: 'verbs', title: 'Action Verbs', score: verbScore, max: 10,
            type: !gate ? 'bad' : verbScore >= 8 ? 'good' : verbScore >= 4 ? 'warning' : 'bad',
            icon: !gate ? 'fa-xmark' : verbScore >= 8 ? 'fa-check' : verbScore >= 4 ? 'fa-triangle-exclamation' : 'fa-xmark',
            desc: !gate ? 'Skipped — text not selectable.' : verbScore >= 8 ? `Strong use of ${verbsFound.length} action verbs.` : verbScore >= 4 ? `Only ${verbsFound.length} action verbs. Use more (Led, Built, Managed).` : 'Very few action verbs. Start bullets with strong verbs.'
        });

        // 7. Quantified Results (10 pts)
        const numbers = text.match(/\d+[\s]*[%$kKmMbB]|\$\s*\d|increased.*\d|reduced.*\d|improved.*\d|\d+\s*\+/gi) || [];
        const rawQuant = numbers.length >= 5 ? 10 : numbers.length >= 3 ? 7 : numbers.length >= 1 ? 4 : 0;
        const quantScore = rawQuant * gate;
        results.push({
            id: 'quant', title: 'Quantified Results', score: quantScore, max: 10,
            type: !gate ? 'bad' : quantScore >= 8 ? 'good' : quantScore >= 4 ? 'warning' : 'bad',
            icon: !gate ? 'fa-xmark' : quantScore >= 8 ? 'fa-check' : quantScore >= 4 ? 'fa-triangle-exclamation' : 'fa-xmark',
            desc: !gate ? 'Skipped — text not selectable.' : quantScore >= 8 ? `${numbers.length} measurable outcomes detected.` : quantScore >= 4 ? 'Some numbers found. Add more metrics (%, $, quantities).' : 'No quantified results. Add measurable outcomes to bullets.'
        });

        // 8. Bullet Points (8 pts)
        // PDF extraction often strips bullet chars, so use multiple heuristics:
        const bulletRegex = /^\s*[-•●▪▸▹►◆◇○∙·*»›‣⁃→]\s/;          // standard bullets
        const numberedRegex = /^\s*\d{1,2}[.)]\s/;                    // numbered lists
        const actionStartRegex = /^\s*(Led|Managed|Developed|Built|Created|Designed|Implemented|Launched|Increased|Decreased|Reduced|Improved|Optimized|Delivered|Achieved|Established|Negotiated|Coordinated|Spearheaded|Streamlined|Automated|Mentored|Architected|Orchestrated|Executed|Analyzed|Resolved|Transformed|Accelerated|Generated|Maintained|Supervised|Trained|Collaborated|Utilized|Conducted|Performed|Organized|Oversaw|Facilitated|Administered|Directed|Prepared|Presented|Researched|Drafted|Reviewed|Assessed|Evaluated|Monitored|Supported|Assisted|Contributed|Drove|Ensured|Enhanced|Initiated|Integrated|Pioneered|Revamped)\b/;
        const bLines = lines.filter(l => bulletRegex.test(l) || numberedRegex.test(l) || actionStartRegex.test(l));
        const rawBullet = bLines.length >= 8 ? 8 : bLines.length >= 4 ? 6 : bLines.length >= 1 ? 3 : 0;
        const bulletScore = rawBullet * gate;
        results.push({
            id: 'bullets', title: 'Bullet Points', score: bulletScore, max: 8,
            type: !gate ? 'bad' : bulletScore >= 7 ? 'good' : bulletScore >= 3 ? 'warning' : 'bad',
            icon: !gate ? 'fa-xmark' : bulletScore >= 7 ? 'fa-check' : bulletScore >= 3 ? 'fa-triangle-exclamation' : 'fa-xmark',
            desc: !gate ? 'Skipped — text not selectable.' : bulletScore >= 7 ? `${bLines.length} bullet-style lines — well-structured content.` : bulletScore >= 3 ? `${bLines.length} bullet-style lines found. Consider using more.` : 'No bullet points detected. Use - or • for experience descriptions.'
        });

        // 9. Length (10 pts)
        const rawLen = wordCount >= 200 && wordCount <= 1500 ? 10 : wordCount >= 100 && wordCount <= 2000 ? 6 : 2;
        const lenScore = rawLen * gate;
        results.push({
            id: 'length', title: 'Resume Length', score: lenScore, max: 10,
            type: !gate ? 'bad' : lenScore >= 8 ? 'good' : lenScore >= 5 ? 'warning' : 'bad',
            icon: !gate ? 'fa-xmark' : lenScore >= 8 ? 'fa-check' : lenScore >= 5 ? 'fa-triangle-exclamation' : 'fa-xmark',
            desc: !gate ? 'Skipped — text not selectable.' : lenScore >= 8 ? `${wordCount} words — ideal length for ATS.` : wordCount < 200 ? `Only ${wordCount} words — resume is too short.` : `${wordCount} words — may be too long.`
        });

        // 10. File Format (10 pts)
        const fmtScore = 10 * gate;
        results.push({
            id: 'format', title: 'File Format', score: fmtScore, max: 10,
            type: !gate ? 'bad' : 'good', icon: !gate ? 'fa-xmark' : 'fa-check',
            desc: !gate ? 'Skipped — text not selectable.' : 'Parseable file format detected.'
        });

        const totalScore = results.reduce((s, r) => s + r.score, 0);
        const maxScore = results.reduce((s, r) => s + r.max, 0);
        const pct = Math.round((totalScore / maxScore) * 100);
        return { score: pct, results, text };
    }

    /* ═══════════════════════════════════════════
       SMART RESUME SECTION PARSER
       ═══════════════════════════════════════════ */
    function parseResumeText(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const parsed = { name: '', email: '', phone: '', location: '', linkedin: '', summary: '', experience: [], education: [], projects: [], skills: [], certs: [] };

        // Extract contact info from first few lines
        const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
        const phoneMatch = text.match(/[\(]?\d{3}[\)\s.-]?\s?\d{3}[\s.-]?\d{4}/) || text.match(/\+?\d[\d\s.-]{9,}/);
        const linkedinMatch = text.match(/linkedin\.com\/in\/[\w-]+/i);
        if (emailMatch) parsed.email = emailMatch[0];
        if (phoneMatch) parsed.phone = phoneMatch[0].trim();
        if (linkedinMatch) parsed.linkedin = linkedinMatch[0];

        // Name = first non-empty line that doesn't look like a header/contact
        for (const l of lines.slice(0, 5)) {
            if (/@/.test(l) || /\d{3}/.test(l) || /linkedin/i.test(l)) continue;
            if (/^(summary|objective|experience|education|skills)/i.test(l)) continue;
            if (l.length >= 3 && l.length <= 50) { parsed.name = l.replace(/[|,].*$/, '').trim(); break; }
        }

        // Location: look for city/state patterns
        const locMatch = text.match(/([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z]{2})\b/);
        if (locMatch) parsed.location = locMatch[1];

        // Split into sections by detecting headings
        // Much more flexible matching: headings can appear with extra text, mixed case, etc.
        const sectionMap = [];
        const HEADING_PATTERNS = [
            { key: 'summary', rx: /\b(professional\s*summary|summary|executive\s*summary|career\s*summary|objective|career\s*objective|professional\s*profile|profile|about\s*me|about)\b/i },
            { key: 'experience', rx: /\b(professional\s*experience|work\s*experience|experience|employment\s*history|employment|work\s*history|career\s*history|relevant\s*experience)\b/i },
            { key: 'education', rx: /\b(education|academic\s*background|academic|qualifications?|educational\s*background|degrees?)\b/i },
            { key: 'skills', rx: /\b(skills|technical\s*skills|core\s*competencies|competencies|key\s*skills|areas\s*of\s*expertise|technologies|proficiencies|tools\s*&?\s*technologies)\b/i },
            { key: 'projects', rx: /\b(projects?|personal\s*projects?|key\s*projects?|portfolio)\b/i },
            { key: 'certs', rx: /\b(certifications?|certificates?|licenses?|accreditations?|professional\s*development)\b/i },
        ];

        lines.forEach((l, i) => {
            const clean = l.replace(/[:\-_=─—│|]/g, '').trim();
            if (clean.length < 3 || clean.length > 60) return;

            // 1. Is it short enough to be a heading?
            const words = clean.split(/\s+/).length;
            if (words > 5) return;

            // 2. Does it perfectly match a known strong heading pattern?
            let matchedKey = null;
            for (const pat of HEADING_PATTERNS) {
                // Require the heading pattern to be the standalone content of the line, or start the line
                if (new RegExp('^\\s*' + pat.rx.source + '\\s*$', 'i').test(clean) ||
                    new RegExp('^\\s*' + pat.rx.source + ':', 'i').test(clean)) {
                    matchedKey = pat.key;
                    break;
                }
            }

            if (matchedKey) {
                // Prevent consecutive identical section headers
                if (sectionMap.length === 0 || sectionMap[sectionMap.length - 1].key !== matchedKey) {
                    sectionMap.push({ key: matchedKey, heading: clean.toLowerCase(), startIdx: i });
                }
            } else if (clean === clean.toUpperCase() && clean.length >= 4 && words <= 3) {
                // Only fallback to checking UPPERCASE if it resembles a 1-3 word title.
                for (const pat of HEADING_PATTERNS) {
                    if (pat.rx.test(clean)) {
                        if (sectionMap.length === 0 || sectionMap[sectionMap.length - 1].key !== pat.key) {
                            sectionMap.push({ key: pat.key, heading: clean.toLowerCase(), startIdx: i });
                        }
                        break;
                    }
                }
            }
        });

        // Extract content for each section
        sectionMap.forEach((sec, si) => {
            const nextIdx = si < sectionMap.length - 1 ? sectionMap[si + 1].startIdx : lines.length;
            const content = lines.slice(sec.startIdx + 1, nextIdx);
            const block = content.join('\n');
            const k = sec.key;

            if (k === 'summary') {
                parsed.summary = content.join(' ').substring(0, 500);
            } else if (k === 'experience') {
                parsed.experience = parseExpEntries(content);
            } else if (k === 'education') {
                parsed.education = parseEduEntries(content);
            } else if (k === 'skills') {
                // Split aggressively by any common delimiter, including newlines, pipes, bullets, commas
                const skillsExtracted = block.split(/[,;|•●▪\n\t]+/).map(s => s.replace(/^[-•*▪●]\s*/, '').trim()).filter(s => s.length >= 2 && s.length <= 50);

                // Remove duplicates by converting to Set and back to array
                parsed.skills = [...new Set(skillsExtracted)];
            } else if (k === 'projects') {
                parsed.projects = parseProjEntries(content);
            } else if (k === 'certs') {
                parsed.certs = content.filter(l => l.length > 3).map(l => ({ name: l.replace(/^[-•*▪●]\s*/, '').trim(), issuer: '' }));
            }
        });

        // If NO sections were detected at all, try a best-effort: treat entire text as summary
        if (sectionMap.length === 0 && lines.length > 0) {
            // Skip the first few lines (likely name/contact), use rest as summary
            const bodyLines = lines.slice(Math.min(3, lines.length));
            parsed.summary = bodyLines.join(' ').substring(0, 500);
        }

        return parsed;
    }

    function parseExpEntries(lines) {
        const entries = []; let current = null;
        for (const l of lines) {
            // Better matching for dates (e.g. "Jan 2020 - Present", "2018-2022")
            const dateMatch = l.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[A-Za-z]*\s*\d{4}|\d{4})\s*[-–—to]+\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[A-Za-z]*\s*\d{4}|\d{4}|Present|Current)/i);
            const isBullet = /^\s*[-•*▪●]/.test(l);

            // Assume it's a new job title / company line if it's not a bullet, not a date, and not too long.
            if (!isBullet && !dateMatch && l.length > 3 && l.length < 100 && !/^\d$/.test(l)) {

                // Only save the current if it actually has a company or title
                if (current && (current.title || current.company)) entries.push(current);

                // Attempt to split lines that have "Title at Company" or "Title | Company"
                const parts = l.split(/\s+(?:[-–—|]|at|@)\s+/i);

                current = {
                    title: parts[0] || l,
                    company: parts.length > 1 ? parts[1] : '',
                    start: '', end: '', desc: ''
                };
            } else if (dateMatch && current) {
                current.start = dateMatch[1]; current.end = dateMatch[2];
            } else if (isBullet && current) {
                current.desc += (current.desc ? '\n' : '') + l;
            } else if (current && l.length > 3) {
                // If it's just raw text underneath a job block (no bullets), handle it:
                if (!current.company && l.length < 50) {
                    current.company = l;
                } else {
                    current.desc += (current.desc ? '\n' : '') + '- ' + l; // Force it to be a bullet
                }
            }
        }
        if (current && (current.title || current.company)) entries.push(current);
        return entries;
    }

    function parseEduEntries(lines) {
        const entries = []; let current = null;
        for (const l of lines) {
            const dateMatch = l.match(/(\d{4})\s*[-–—to]+\s*(\d{4}|Present)/i) || l.match(/(\w+\s*\d{4})\s*[-–—to]+\s*(\w+\s*\d{4}|Present)/i);

            // If it's a completely new school/degree block
            if (!current || (l.length > 5 && l.length < 80 && !/^\s*[-•*]/.test(l) && !dateMatch)) {
                if (l.length < 5) continue;

                // Only push if we actually got a degree or school defined on the old block
                if (current && (current.degree || current.school)) entries.push(current);

                const hasDeg = /\b(B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|Ph\.?D|MBA|Bachelor|Master|Associate|Diploma|Certificate|BTech|MTech|BCA|MCA|BBA)\b/i.test(l);

                // Attempt to split single-line entries like "B.Sc Computer Science - University of X"
                if (l.includes('-') || l.includes('|') || l.includes(',')) {
                    const parts = l.split(/[-|,]/).map(p => p.trim());
                    current = {
                        degree: hasDeg ? (parts.find(p => /\b(B\.?S\.?|M\.?S\.?|Bachelor|Master|BTech|MBA)/i.test(p)) || parts[0]) : '',
                        school: parts.length > 1 ? parts[1] : (hasDeg ? '' : l),
                        start: '', end: ''
                    };
                } else {
                    current = { school: hasDeg ? '' : l, degree: hasDeg ? l : '', start: '', end: '' };
                }
            } else if (dateMatch && current) {
                current.start = dateMatch[1]; current.end = dateMatch[2];
            } else if (current) {
                // Append missing pieces
                if (!current.degree && /\b(B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?|Ph\.?D|MBA|Bachelor|Master|Associate|Diploma)\b/i.test(l)) {
                    current.degree = l;
                } else if (!current.school && l.length > 5) {
                    current.school = l;
                }
            }
        }
        if (current && (current.degree || current.school)) entries.push(current);
        return entries;
    }

    function parseProjEntries(lines) {
        const entries = []; let current = null;
        for (const l of lines) {
            const isBullet = /^\s*[-•*▪●]/.test(l);

            // Assume New Project if it's not a bullet, under 100 chars, and not just a number
            if (!isBullet && l.length > 3 && l.length < 100 && !/^\d+$/.test(l)) {
                if (current && current.name) entries.push(current);

                // Attempt to split lines like "Project Name | React, Node"
                const parts = l.split(/\s+(?:[-–—|])\s+/i);

                current = {
                    name: parts[0] || l.replace(/^[-•*▪●]\s*/, '').trim(),
                    tech: parts.length > 1 ? parts.slice(1).join(', ') : '',
                    desc: ''
                };
            } else if (isBullet && current) {
                current.desc += (current.desc ? '\n' : '') + l;
            } else if (current && l.length > 3) {
                // Raw text under a project; if short maybe it's tech stack, else it's a desc bullet
                if (!current.tech && l.length < 50 && (l.includes(',') || /react|node|js|python|java|html|aws/i.test(l))) {
                    current.tech = l;
                } else {
                    current.desc += (current.desc ? '\n' : '') + '- ' + l;
                }
            }
        }
        if (current && current.name) entries.push(current);
        return entries;
    }

    /* ═══════════════════════════════════════════
       POPULATE BUILDER FROM PARSED DATA
       ═══════════════════════════════════════════ */
    function populateBuilder(parsed) {
        document.getElementById('fullName').value = parsed.name || '';
        document.getElementById('email').value = parsed.email || '';
        document.getElementById('phone').value = parsed.phone || '';
        document.getElementById('location').value = parsed.location || '';
        document.getElementById('linkedin').value = parsed.linkedin || '';
        document.getElementById('summary').value = parsed.summary || '';
        document.getElementById('skillsInput').value = (parsed.skills || []).join(', ');

        // Experience
        const expList = document.getElementById('experienceList');
        expList.innerHTML = '';
        (parsed.experience.length ? parsed.experience : [{ title: '', company: '', start: '', end: '', desc: '' }]).forEach(e => {
            expList.appendChild(makeCard('experience-item', `
                <button class="delete-entry-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button>
                <div class="form-group"><label>Company</label><input type="text" class="exp-company" value="${esc(e.company)}"></div>
                <div class="form-group"><label>Job Title</label><input type="text" class="exp-title" value="${esc(e.title)}"></div>
                <div class="form-row"><div class="form-group"><label>Start</label><input type="text" class="exp-start" value="${esc(e.start)}"></div>
                <div class="form-group"><label>End</label><input type="text" class="exp-end" value="${esc(e.end)}"></div></div>
                <div class="form-group"><label>Description</label><textarea class="exp-desc" rows="4">${esc(e.desc)}</textarea></div>`));
        });

        // Education
        const eduList = document.getElementById('educationList');
        eduList.innerHTML = '';
        (parsed.education.length ? parsed.education : [{ school: '', degree: '', start: '', end: '' }]).forEach(e => {
            eduList.appendChild(makeCard('education-item', `
                <button class="delete-entry-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button>
                <div class="form-group"><label>Institution</label><input type="text" class="edu-school" value="${esc(e.school)}"></div>
                <div class="form-group"><label>Degree</label><input type="text" class="edu-degree" value="${esc(e.degree)}"></div>
                <div class="form-row"><div class="form-group"><label>Start</label><input type="text" class="edu-start" value="${esc(e.start)}"></div>
                <div class="form-group"><label>End</label><input type="text" class="edu-end" value="${esc(e.end)}"></div></div>`));
        });

        // Internships (optional)
        const internList = document.getElementById('internshipsList');
        internList.innerHTML = '';
        if (parsed.internships && parsed.internships.length) {
            parsed.internships.forEach(e => {
                internList.appendChild(makeCard('internship-item', `
                    <button class="delete-entry-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button>
                    <div class="form-group"><label>Company</label><input type="text" class="intern-company" value="${esc(e.company)}"></div>
                    <div class="form-group"><label>Role / Title</label><input type="text" class="intern-title" value="${esc(e.title)}"></div>
                    <div class="form-row"><div class="form-group"><label>Start</label><input type="text" class="intern-start" value="${esc(e.start)}"></div>
                    <div class="form-group"><label>End</label><input type="text" class="intern-end" value="${esc(e.end)}"></div></div>
                    <div class="form-group"><label>Description</label><textarea class="intern-desc" rows="3">${esc(e.desc)}</textarea></div>`));
            });
        }

        // Projects (optional)
        const projList = document.getElementById('projectsList');
        projList.innerHTML = '';
        if (parsed.projects && parsed.projects.length) {
            parsed.projects.forEach(p => {
                projList.appendChild(makeCard('project-item', `
                    <button class="delete-entry-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button>
                    <div class="form-group"><label>Project Name</label><input type="text" class="proj-name" value="${esc(p.name)}"></div>
                    <div class="form-group"><label>Tech Stack</label><input type="text" class="proj-tech" value="${esc(p.tech)}"></div>
                    <div class="form-group"><label>Description</label><textarea class="proj-desc" rows="3">${esc(p.desc)}</textarea></div>`));
            });
        }

        // Certifications
        const certList = document.getElementById('certsList');
        certList.innerHTML = '';
        (parsed.certs.length ? parsed.certs : [{ name: '', issuer: '' }]).forEach(c => {
            certList.appendChild(makeCard('cert-item', `
                <button class="delete-entry-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button>
                <div class="form-group"><label>Certification</label><input type="text" class="cert-name" value="${esc(c.name)}"></div>
                <div class="form-group"><label>Issuer & Year</label><input type="text" class="cert-issuer" value="${esc(c.issuer)}"></div>`));
        });

        // Open all accordion sections
        document.querySelectorAll('.accordion-item').forEach(a => a.classList.add('active'));
        renderPreview();
    }

    function makeCard(cls, html) {
        const el = document.createElement('div'); el.className = `form-card ${cls}`; el.innerHTML = html; return el;
    }

    /* ---------- ATS CHECKER — FILE HANDLING ---------- */
    uploadBtn.addEventListener('click', e => { e.stopPropagation(); resumeUpload.click(); });
    dropZone.addEventListener('click', () => resumeUpload.click());
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); if (e.dataTransfer.files.length) startAnalysis(e.dataTransfer.files[0]); });
    resumeUpload.addEventListener('change', () => { if (resumeUpload.files.length) startAnalysis(resumeUpload.files[0]); });

    const STEPS = [
        { text: 'Extracting text from document...', pct: 8 },
        { text: 'Checking text selectability...', pct: 20 },
        { text: 'Checking contact information...', pct: 32 },
        { text: 'Scanning section headings...', pct: 44 },
        { text: 'Analyzing keywords & action verbs...', pct: 56 },
        { text: 'Evaluating bullet points...', pct: 68 },
        { text: 'Checking quantified results...', pct: 80 },
        { text: 'Calculating ATS score...', pct: 95 },
    ];

    let lastExtractionResult = null;
    let lastUploadedFile = null; // Store original file for re-download

    async function startAnalysis(file) {
        fileNameEl.textContent = file.name; fileNameEl.classList.remove('hidden');
        dropZone.classList.add('hidden'); resultsArea.classList.add('hidden');
        analyzingState.classList.remove('hidden'); progressFill.style.width = '0%';

        let step = 0;
        const iv = setInterval(() => {
            if (step < 3) { progressFill.style.width = STEPS[step].pct + '%'; analyzeStep.textContent = STEPS[step].text; step++; }
        }, 400);

        let extraction = null;
        try { extraction = await extractText(file); } catch (err) {
            clearInterval(iv); analyzingState.classList.add('hidden'); dropZone.classList.remove('hidden');
            toast('Failed to read file. Try a .txt or .pdf file.', 'info'); return;
        }

        const text = extraction.text;
        if (!text || text.trim().length < 5) {
            clearInterval(iv); analyzingState.classList.add('hidden'); dropZone.classList.remove('hidden');
            toast('Could not extract text. Try a different file format.', 'info'); return;
        }

        clearInterval(iv);
        for (let i = 3; i < STEPS.length; i++) {
            progressFill.style.width = STEPS[i].pct + '%'; analyzeStep.textContent = STEPS[i].text;
            await delay(350);
        }
        progressFill.style.width = '100%';
        await delay(300);

        lastExtractionResult = extraction;
        lastUploadedFile = file;
        const analysis = analyzeResume(text, extraction);
        lastParsedResume = parseResumeText(text);
        showResults(analysis);
    }

    function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

    function showResults(analysis) {
        analyzingState.classList.add('hidden');
        const score = analysis.score;
        const afterScore = Math.min(score + 15 + Math.round((100 - score) * 0.3), 98);

        // Score ring
        const circ = 2 * Math.PI * 52;
        scoreRingFill.style.strokeDashoffset = circ;
        requestAnimationFrame(() => { scoreRingFill.style.strokeDashoffset = circ - (score / 100) * circ; scoreRingFill.style.stroke = sColor(score); });
        animateNum(atsScoreText, 0, score, 1000); atsScoreText.style.color = sCSSColor(score);

        if (score >= 75) { scoreTitle.textContent = 'Great Score!'; scoreDesc.textContent = 'Your resume is well-optimized. Minor tweaks could push it even higher.'; }
        else if (score >= 55) { scoreTitle.textContent = 'Needs Improvement'; scoreDesc.textContent = 'Your resume has issues that may cause ATS filtering. Use Auto-Fix.'; }
        else { scoreTitle.textContent = 'Poor — Fix Required'; scoreDesc.textContent = 'Your resume is likely to be rejected. Click Auto-Fix to generate an optimized version.'; }

        // Compare bars
        setTimeout(() => {
            compareBeforeBar.style.width = score + '%'; compareAfterBar.style.width = afterScore + '%';
            animateNum(compareBeforeVal, 0, score, 800); animateNum(compareAfterVal, 0, afterScore, 1000);
            compareBeforeVal.style.color = sCSSColor(score); compareAfterVal.style.color = sCSSColor(afterScore);
        }, 200);

        // Feedback cards from real analysis
        feedbackGrid.innerHTML = analysis.results.map(r =>
            `<div class="feedback-card ${r.type}"><div class="feedback-header"><i class="fa-solid ${r.icon}"></i><h4>${r.title} (${r.score}/${r.max})</h4></div><p>${r.desc}</p></div>`
        ).join('');

        resultsArea.classList.remove('hidden');
        toast('Analysis complete!', 'success');
    }

    function animateNum(el, from, to, dur) {
        const st = performance.now();
        (function up(now) { const p = Math.min((now - st) / dur, 1); el.textContent = Math.floor(from + (to - from) * p) + '%'; if (p < 1) requestAnimationFrame(up); })(st);
    }
    function sColor(s) { return s >= 75 ? '#34d399' : s >= 55 ? '#fbbf24' : '#f87171'; }
    function sCSSColor(s) { return s >= 75 ? 'var(--green)' : s >= 55 ? 'var(--yellow)' : 'var(--red)'; }

    checkAnotherBtn.addEventListener('click', () => { resultsArea.classList.add('hidden'); dropZone.classList.remove('hidden'); fileNameEl.classList.add('hidden'); resumeUpload.value = ''; lastParsedResume = null; lastExtractionResult = null; lastUploadedFile = null; });

    // AUTO-FIX: if selectable → download original, if not → generate selectable PDF
    fixResumeBtn.addEventListener('click', () => {
        if (!lastExtractionResult || !lastUploadedFile) {
            toast('No resume data available. Upload a resume first.', 'info');
            return;
        }

        // Text IS selectable → download the original uploaded file as-is
        if (lastExtractionResult.isSelectable) {
            toast('Text is already selectable! Downloading your original resume...', 'success');
            const url = URL.createObjectURL(lastUploadedFile);
            const a = document.createElement('a');
            a.href = url;
            a.download = lastUploadedFile.name;
            a.click();
            URL.revokeObjectURL(url);
            return;
        }

        // Text is NOT selectable → generate a clean PDF with selectable text
        if (!lastParsedResume) {
            toast('Could not parse resume content.', 'info');
            return;
        }
        toast('Making text selectable and generating fixed PDF...', 'info');

        const d = lastParsedResume;
        let html = `<div style="font-family:Calibri,Arial,sans-serif;color:#1e293b;line-height:1.6;font-size:11pt;padding:20px">`;
        if (d.name) html += `<h1 style="font-size:18pt;margin:0 0 4px">${esc(d.name)}</h1>`;
        const contact = [d.email, d.phone, d.location, d.linkedin].filter(Boolean).join(' | ');
        if (contact) html += `<p style="color:#64748b;font-size:9pt;margin:0 0 12px">${esc(contact)}</p>`;
        if (d.summary) { html += `<h2 style="font-size:11pt;color:#1e40af;text-transform:uppercase;border-bottom:2px solid #3b82f6;padding-bottom:2px;margin:14px 0 8px">Professional Summary</h2>`; html += `<p style="margin:0 0 8px">${esc(d.summary)}</p>`; }
        if (d.experience.length) { html += `<h2 style="font-size:11pt;color:#1e40af;text-transform:uppercase;border-bottom:2px solid #3b82f6;padding-bottom:2px;margin:14px 0 8px">Work Experience</h2>`; d.experience.forEach(e => { html += `<p style="font-weight:bold;margin:8px 0 2px">${esc(e.title)}${e.company ? ' — ' + esc(e.company) : ''}</p>`; if (e.start) html += `<p style="font-size:9pt;color:#64748b;margin:0">${esc(e.start)} – ${esc(e.end)}</p>`; if (e.desc) { const bullets = e.desc.split('\n').filter(l => l.trim()); html += '<ul style="padding-left:18px;margin:4px 0">'; bullets.forEach(b => html += `<li>${esc(b.replace(/^[-•*]\s*/, ''))}</li>`); html += '</ul>'; } }); }
        if (d.education.length) { html += `<h2 style="font-size:11pt;color:#1e40af;text-transform:uppercase;border-bottom:2px solid #3b82f6;padding-bottom:2px;margin:14px 0 8px">Education</h2>`; d.education.forEach(e => { html += `<p style="font-weight:bold;margin:6px 0 2px">${esc(e.degree)}</p>`; html += `<p style="font-size:9pt;color:#64748b;margin:0">${esc(e.school)}${e.start ? ' | ' + esc(e.start) + ' – ' + esc(e.end) : ''}</p>`; }); }
        if (d.skills.length) { html += `<h2 style="font-size:11pt;color:#1e40af;text-transform:uppercase;border-bottom:2px solid #3b82f6;padding-bottom:2px;margin:14px 0 8px">Skills</h2>`; html += `<p>${d.skills.map(s => esc(s)).join(', ')}</p>`; }
        if (d.projects.length && d.projects.some(p => p.name)) { html += `<h2 style="font-size:11pt;color:#1e40af;text-transform:uppercase;border-bottom:2px solid #3b82f6;padding-bottom:2px;margin:14px 0 8px">Projects</h2>`; d.projects.forEach(p => { if (!p.name) return; html += `<p style="font-weight:bold;margin:6px 0 2px">${esc(p.name)}</p>`; if (p.tech) html += `<p style="font-size:9pt;color:#475569;font-style:italic;margin:0">${esc(p.tech)}</p>`; if (p.desc) { const bullets = p.desc.split('\n').filter(l => l.trim()); html += '<ul style="padding-left:18px;margin:4px 0">'; bullets.forEach(b => html += `<li>${esc(b.replace(/^[-•*]\s*/, ''))}</li>`); html += '</ul>'; } }); }
        if (d.certs.length && d.certs.some(c => c.name)) { html += `<h2 style="font-size:11pt;color:#1e40af;text-transform:uppercase;border-bottom:2px solid #3b82f6;padding-bottom:2px;margin:14px 0 8px">Certifications</h2>`; d.certs.forEach(c => { if (!c.name) return; html += `<p style="margin:4px 0">${esc(c.name)}${c.issuer ? ' — ' + esc(c.issuer) : ''}</p>`; }); }
        html += '</div>';

        const container = document.createElement('div');
        container.innerHTML = html;
        document.body.appendChild(container);
        html2pdf().set({
            margin: [0.4, 0.5, 0.4, 0.5],
            filename: 'ATS_Fixed_Resume.pdf',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        }).from(container).save().then(() => {
            document.body.removeChild(container);
            toast('ATS-friendly PDF with selectable text downloaded!', 'success');
        });
    });


    /* ---------- RESET BUILDER ---------- */
    document.getElementById('resetBuilderBtn').addEventListener('click', () => {
        populateBuilder({ name: '', email: '', phone: '', location: '', linkedin: '', summary: '', experience: [], internships: [], education: [], projects: [], skills: [], certs: [] });
        toast('Builder reset!', 'info');
    });

    /* ---------- LIVE PREVIEW ---------- */
    function gatherData() {
        const d = { name: val('fullName'), email: val('email'), phone: val('phone'), location: val('location'), linkedin: val('linkedin'), summary: val('summary'), skills: document.getElementById('skillsInput').value.split(',').map(s => s.trim()).filter(Boolean), experience: [], internships: [], education: [], projects: [], certs: [] };
        document.querySelectorAll('.experience-item').forEach(i => d.experience.push({ company: i.querySelector('.exp-company').value, title: i.querySelector('.exp-title').value, start: i.querySelector('.exp-start').value, end: i.querySelector('.exp-end').value, desc: i.querySelector('.exp-desc').value }));
        document.querySelectorAll('.internship-item').forEach(i => d.internships.push({ company: i.querySelector('.intern-company').value, title: i.querySelector('.intern-title').value, start: i.querySelector('.intern-start').value, end: i.querySelector('.intern-end').value, desc: i.querySelector('.intern-desc').value }));
        document.querySelectorAll('.education-item').forEach(i => d.education.push({ school: i.querySelector('.edu-school').value, degree: i.querySelector('.edu-degree').value, start: i.querySelector('.edu-start').value, end: i.querySelector('.edu-end').value }));
        document.querySelectorAll('.project-item').forEach(i => d.projects.push({ name: i.querySelector('.proj-name').value, tech: i.querySelector('.proj-tech').value, desc: i.querySelector('.proj-desc').value }));
        document.querySelectorAll('.cert-item').forEach(i => d.certs.push({ name: i.querySelector('.cert-name').value, issuer: i.querySelector('.cert-issuer').value }));
        return d;
    }
    function val(id) { return document.getElementById(id).value; }

    /* ---------- TEMPLATE SYSTEM ---------- */
    let currentTemplate = 'classic';

    // Template selector click events
    document.querySelectorAll('.template-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.template-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            currentTemplate = opt.dataset.template;
            renderPreview();
        });
    });

    function renderPreview() {
        const d = gatherData();
        // Remove old template classes
        resumePreview.className = 'resume-paper';
        if (currentTemplate !== 'classic') resumePreview.classList.add('tpl-' + currentTemplate);

        switch (currentTemplate) {
            case 'modern': resumePreview.innerHTML = renderModern(d); break;
            case 'executive': resumePreview.innerHTML = renderExecutive(d); break;
            case 'compact': resumePreview.innerHTML = renderCompact(d); break;
            default: resumePreview.innerHTML = renderClassic(d);
        }
    }

    /* --- Classic Template --- */
    function renderClassic(d) {
        let h = `<h1>${esc(d.name)}</h1><div class="res-contact">${esc(d.email)} &nbsp;|&nbsp; ${esc(d.phone)} &nbsp;|&nbsp; ${esc(d.location)}${d.linkedin ? ' &nbsp;|&nbsp; ' + esc(d.linkedin) : ''}</div>`;
        if (d.summary) h += `<div class="res-section-title">Professional Summary</div><p>${esc(d.summary)}</p>`;
        if (d.experience.some(e => e.title || e.company)) { h += `<div class="res-section-title">Work Experience</div>`; d.experience.forEach(e => { if (!e.title && !e.company) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(e.title)} — ${esc(e.company)}</div><div class="res-entry-meta">${esc(e.start)} – ${esc(e.end)}</div>${bullets(e.desc)}</div>`; }); }
        if (d.internships && d.internships.some(e => e.title || e.company)) { h += `<div class="res-section-title">Internships</div>`; d.internships.forEach(e => { if (!e.title && !e.company) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(e.title)} — ${esc(e.company)}</div><div class="res-entry-meta">${esc(e.start)} – ${esc(e.end)}</div>${bullets(e.desc)}</div>`; }); }
        if (d.projects.some(p => p.name)) { h += `<div class="res-section-title">Projects</div>`; d.projects.forEach(p => { if (!p.name) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(p.name)}</div>${p.tech ? `<div class="res-entry-sub">${esc(p.tech)}</div>` : ''}${bullets(p.desc)}</div>`; }); }
        if (d.education.some(e => e.degree || e.school)) { h += `<div class="res-section-title">Education</div>`; d.education.forEach(e => { if (!e.degree && !e.school) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(e.degree)}</div><div class="res-entry-meta">${esc(e.school)} &nbsp;|&nbsp; ${esc(e.start)} – ${esc(e.end)}</div></div>`; }); }
        if (d.skills.length) { h += `<div class="res-section-title">Skills</div><div class="res-skills">${d.skills.map(s => `<span>${esc(s)}</span>`).join('')}</div>`; }
        if (d.certs.some(c => c.name)) { h += `<div class="res-section-title">Certifications</div>`; d.certs.forEach(c => { if (!c.name) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(c.name)}</div>${c.issuer ? `<div class="res-entry-meta">${esc(c.issuer)}</div>` : ''}</div>`; }); }
        return h;
    }

    /* --- Modern Template (two-column) --- */
    function renderModern(d) {
        // Sidebar: name, contact, skills, education, certs
        let sb = `<h1>${esc(d.name)}</h1>`;
        const contactLines = [d.email, d.phone, d.location, d.linkedin].filter(Boolean);
        if (contactLines.length) sb += `<div class="mod-contact">${contactLines.map(c => esc(c)).join('<br>')}</div>`;
        if (d.skills.length) { sb += `<div class="mod-sec-title">Skills</div>`; sb += d.skills.map(s => `<span class="mod-skill">${esc(s)}</span>`).join(''); }
        if (d.education.some(e => e.degree || e.school)) { sb += `<div class="mod-sec-title">Education</div>`; d.education.forEach(e => { if (!e.degree && !e.school) return; sb += `<div style="margin-bottom:8px"><div style="font-weight:600;font-size:0.78rem">${esc(e.degree)}</div><div style="font-size:0.7rem;color:#94a3b8">${esc(e.school)}</div>${e.start ? `<div style="font-size:0.68rem;color:#64748b">${esc(e.start)} – ${esc(e.end)}</div>` : ''}</div>`; }); }
        if (d.certs.some(c => c.name)) { sb += `<div class="mod-sec-title">Certifications</div>`; d.certs.forEach(c => { if (!c.name) return; sb += `<div class="mod-cert">${esc(c.name)}</div>`; }); }

        // Main content: summary, experience, projects
        let mn = '';
        if (d.summary) mn += `<div class="mod-sec-title">Summary</div><p style="font-size:0.84rem;margin:0 0 8px">${esc(d.summary)}</p>`;
        if (d.experience.some(e => e.title || e.company)) { mn += `<div class="mod-sec-title">Experience</div>`; d.experience.forEach(e => { if (!e.title && !e.company) return; mn += `<div class="mod-entry"><div class="mod-entry-title">${esc(e.title)} — ${esc(e.company)}</div><div class="mod-entry-meta">${esc(e.start)} – ${esc(e.end)}</div>${bullets(e.desc)}</div>`; }); }
        if (d.internships && d.internships.some(e => e.title || e.company)) { mn += `<div class="mod-sec-title">Internships</div>`; d.internships.forEach(e => { if (!e.title && !e.company) return; mn += `<div class="mod-entry"><div class="mod-entry-title">${esc(e.title)} — ${esc(e.company)}</div><div class="mod-entry-meta">${esc(e.start)} – ${esc(e.end)}</div>${bullets(e.desc)}</div>`; }); }
        if (d.projects.some(p => p.name)) { mn += `<div class="mod-sec-title">Projects</div>`; d.projects.forEach(p => { if (!p.name) return; mn += `<div class="mod-entry"><div class="mod-entry-title">${esc(p.name)}</div>${p.tech ? `<div class="mod-entry-meta">${esc(p.tech)}</div>` : ''}${bullets(p.desc)}</div>`; }); }

        return `<div class="mod-sidebar">${sb}</div><div class="mod-main">${mn}</div>`;
    }

    /* --- Executive Template --- */
    function renderExecutive(d) {
        let h = `<h1>${esc(d.name)}</h1><div class="res-contact">${[d.email, d.phone, d.location, d.linkedin].filter(Boolean).map(c => esc(c)).join(' &nbsp;·&nbsp; ')}</div>`;
        if (d.summary) h += `<div class="res-section-title">Executive Summary</div><p>${esc(d.summary)}</p>`;
        if (d.experience.some(e => e.title || e.company)) { h += `<div class="res-section-title">Professional Experience</div>`; d.experience.forEach(e => { if (!e.title && !e.company) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(e.title)}</div><div class="res-entry-meta">${esc(e.company)} &nbsp;|&nbsp; ${esc(e.start)} – ${esc(e.end)}</div>${bullets(e.desc)}</div>`; }); }
        if (d.internships && d.internships.some(e => e.title || e.company)) { h += `<div class="res-section-title">Internships</div>`; d.internships.forEach(e => { if (!e.title && !e.company) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(e.title)}</div><div class="res-entry-meta">${esc(e.company)} &nbsp;|&nbsp; ${esc(e.start)} – ${esc(e.end)}</div>${bullets(e.desc)}</div>`; }); }
        if (d.education.some(e => e.degree || e.school)) { h += `<div class="res-section-title">Education</div>`; d.education.forEach(e => { if (!e.degree && !e.school) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(e.degree)}</div><div class="res-entry-meta">${esc(e.school)} &nbsp;|&nbsp; ${esc(e.start)} – ${esc(e.end)}</div></div>`; }); }
        if (d.projects.some(p => p.name)) { h += `<div class="res-section-title">Key Projects</div>`; d.projects.forEach(p => { if (!p.name) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(p.name)}</div>${p.tech ? `<div class="res-entry-sub">${esc(p.tech)}</div>` : ''}${bullets(p.desc)}</div>`; }); }
        if (d.skills.length) { h += `<div class="res-section-title">Core Competencies</div><div class="res-skills">${d.skills.map(s => `<span>${esc(s)}</span>`).join('')}</div>`; }
        if (d.certs.some(c => c.name)) { h += `<div class="res-section-title">Certifications & Licenses</div>`; d.certs.forEach(c => { if (!c.name) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(c.name)}</div>${c.issuer ? `<div class="res-entry-meta">${esc(c.issuer)}</div>` : ''}</div>`; }); }
        return h;
    }

    /* --- Compact Template --- */
    function renderCompact(d) {
        let h = `<h1>${esc(d.name)}</h1><div class="res-contact">${[d.email, d.phone, d.location, d.linkedin].filter(Boolean).map(c => esc(c)).join(' | ')}</div>`;
        if (d.summary) h += `<div class="res-section-title">Summary</div><p>${esc(d.summary)}</p>`;
        if (d.experience.some(e => e.title || e.company)) { h += `<div class="res-section-title">Experience</div>`; d.experience.forEach(e => { if (!e.title && !e.company) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(e.title)} — ${esc(e.company)} <span class="res-entry-meta" style="float:right">${esc(e.start)} – ${esc(e.end)}</span></div>${bullets(e.desc)}</div>`; }); }
        if (d.internships && d.internships.some(e => e.title || e.company)) { h += `<div class="res-section-title">Internships</div>`; d.internships.forEach(e => { if (!e.title && !e.company) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(e.title)} — ${esc(e.company)} <span class="res-entry-meta" style="float:right">${esc(e.start)} – ${esc(e.end)}</span></div>${bullets(e.desc)}</div>`; }); }
        if (d.projects.some(p => p.name)) { h += `<div class="res-section-title">Projects</div>`; d.projects.forEach(p => { if (!p.name) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(p.name)}${p.tech ? ` <span class="res-entry-meta">(${esc(p.tech)})</span>` : ''}</div>${bullets(p.desc)}</div>`; }); }
        if (d.education.some(e => e.degree || e.school)) { h += `<div class="res-section-title">Education</div>`; d.education.forEach(e => { if (!e.degree && !e.school) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(e.degree)} — ${esc(e.school)} <span class="res-entry-meta" style="float:right">${esc(e.start)} – ${esc(e.end)}</span></div></div>`; }); }
        if (d.skills.length) { h += `<div class="res-section-title">Skills</div><div class="res-skills">${d.skills.map(s => `<span>${esc(s)}</span>`).join('')}</div>`; }
        if (d.certs.some(c => c.name)) { h += `<div class="res-section-title">Certifications</div>`; d.certs.forEach(c => { if (!c.name) return; h += `<div class="res-entry"><div class="res-entry-title">${esc(c.name)}${c.issuer ? ` — ${esc(c.issuer)}` : ''}</div></div>`; }); }
        return h;
    }

    function bullets(t) { if (!t || !t.trim()) return ''; const lines = t.split('\n').map(l => l.trim()).filter(Boolean); if (!lines.length) return ''; return '<ul>' + lines.map(l => `<li>${esc(l.replace(/^\s*[-•*]\s*/, ''))}</li>`).join('') + '</ul>'; }
    function esc(s) { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
    document.querySelector('.builder-controls').addEventListener('input', renderPreview);

    /* ---------- ADD ENTRIES ---------- */
    addExperienceBtn.addEventListener('click', () => appendEntry('experienceList', 'experience-item', `<button class="delete-entry-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button><div class="form-group"><label>Company</label><input type="text" class="exp-company" placeholder="Company" maxlength="150"></div><div class="form-group"><label>Job Title</label><input type="text" class="exp-title" placeholder="Title" maxlength="100"></div><div class="form-row"><div class="form-group"><label>Start</label><input type="text" class="exp-start" placeholder="Jan 2020" maxlength="20"></div><div class="form-group"><label>End</label><input type="text" class="exp-end" placeholder="Present" maxlength="20"></div></div><div class="form-group"><label>Description</label><textarea class="exp-desc" rows="3" placeholder="- Achievements..." maxlength="2500"></textarea></div>`));
    addInternshipBtn.addEventListener('click', () => appendEntry('internshipsList', 'internship-item', `<button class="delete-entry-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button><div class="form-group"><label>Company</label><input type="text" class="intern-company" placeholder="Company" maxlength="150"></div><div class="form-group"><label>Role / Title</label><input type="text" class="intern-title" placeholder="Intern Title" maxlength="100"></div><div class="form-row"><div class="form-group"><label>Start</label><input type="text" class="intern-start" placeholder="Jun 2023" maxlength="20"></div><div class="form-group"><label>End</label><input type="text" class="intern-end" placeholder="Aug 2023" maxlength="20"></div></div><div class="form-group"><label>Description</label><textarea class="intern-desc" rows="3" placeholder="- What you worked on..." maxlength="2500"></textarea></div>`));
    addEducationBtn.addEventListener('click', () => appendEntry('educationList', 'education-item', `<button class="delete-entry-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button><div class="form-group"><label>Institution</label><input type="text" class="edu-school" placeholder="University" maxlength="150"></div><div class="form-group"><label>Degree</label><input type="text" class="edu-degree" placeholder="Degree" maxlength="100"></div><div class="form-row"><div class="form-group"><label>Start</label><input type="text" class="edu-start" placeholder="Sep 2016" maxlength="20"></div><div class="form-group"><label>End</label><input type="text" class="edu-end" placeholder="May 2020" maxlength="20"></div></div>`));
    addProjectBtn.addEventListener('click', () => appendEntry('projectsList', 'project-item', `<button class="delete-entry-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button><div class="form-group"><label>Project Name</label><input type="text" class="proj-name" placeholder="Project" maxlength="150"></div><div class="form-group"><label>Tech Stack</label><input type="text" class="proj-tech" placeholder="React, Node.js" maxlength="150"></div><div class="form-group"><label>Description</label><textarea class="proj-desc" rows="3" placeholder="- Details..." maxlength="2500"></textarea></div>`));
    addCertBtn.addEventListener('click', () => appendEntry('certsList', 'cert-item', `<button class="delete-entry-btn" title="Remove"><i class="fa-solid fa-trash-can"></i></button><div class="form-group"><label>Certification</label><input type="text" class="cert-name" placeholder="Name" maxlength="150"></div><div class="form-group"><label>Issuer & Year</label><input type="text" class="cert-issuer" placeholder="Issuer — Year" maxlength="150"></div>`));
    function appendEntry(listId, cls, html) { const el = document.createElement('div'); el.className = `form-card ${cls}`; el.innerHTML = html; document.getElementById(listId).appendChild(el); renderPreview(); toast('Entry added', 'success'); }

    /* ---------- DOWNLOADS ---------- */
    downloadPdfBtn.addEventListener('click', () => { toast('Generating PDF...', 'info'); html2pdf().set({ margin: [0.4, 0.5, 0.4, 0.5], filename: 'ATS_Resume.pdf', image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } }).from(resumePreview).save().then(() => toast('PDF downloaded!', 'success')); });
    downloadDocBtn.addEventListener('click', () => { toast('Generating Word...', 'info'); const s = '<style>body{font-family:Calibri,sans-serif;color:#1e293b;line-height:1.6;font-size:11pt}h1{font-size:18pt}.res-contact{color:#64748b;font-size:9pt;margin-bottom:12px}.res-section-title{font-size:11pt;font-weight:bold;color:#1e40af;text-transform:uppercase;border-bottom:2px solid #3b82f6;padding-bottom:2px;margin-top:14px}.res-entry{margin-bottom:10px}.res-entry-title{font-weight:bold}.res-entry-sub{font-size:9pt;color:#475569;font-style:italic}.res-entry-meta{font-size:9pt;color:#64748b}ul{padding-left:18px}.res-skills span{background:#eff6ff;color:#1e40af;padding:2px 8px;border-radius:3px;font-size:9pt;margin-right:4px}</style>'; const b = new Blob([`<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">${s}</head><body>${resumePreview.innerHTML}</body></html>`], { type: 'application/msword' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ATS_Resume.doc'; a.click(); URL.revokeObjectURL(a.href); toast('Word downloaded!', 'success'); });

    renderPreview();
})();
