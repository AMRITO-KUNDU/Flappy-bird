// Canvas logical size constants
const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;

class AudioSystem {
    constructor(getUserSettings) {
        this.getUserSettings = getUserSettings;
        this.ctx = null;
        this.masterGain = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.musicTimer = null;
        this.musicSeed = 0;
    }

    ensureContext() {
        if (this.ctx) return;
        const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextImpl) return;

        this.ctx = new AudioContextImpl();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 1;
        this.masterGain.connect(this.ctx.destination);

        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0;
        this.musicGain.connect(this.masterGain);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0;
        this.sfxGain.connect(this.masterGain);
    }

    async unlock() {
        this.ensureContext();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            try {
                await this.ctx.resume();
            } catch {
                // Ignore: browser may require a stronger user gesture.
            }
        }
        this.syncGains();
    }

    syncGains() {
        if (!this.ctx || !this.masterGain) return;
        const s = this.getUserSettings();
        const masterMuted = !!s.masterMuted;
        const sfxEnabled = !!s.sfxEnabled && !masterMuted;
        const musicEnabled = !!s.musicEnabled && !masterMuted;

        const sfxVolume = typeof s.sfxVolume === 'number' ? s.sfxVolume : 0.6;
        const musicVolume = typeof s.musicVolume === 'number' ? s.musicVolume : 0.25;

        if (this.sfxGain) this.sfxGain.gain.value = sfxEnabled ? Math.max(0, Math.min(1, sfxVolume)) : 0;
        if (this.musicGain) this.musicGain.gain.value = musicEnabled ? Math.max(0, Math.min(1, musicVolume)) : 0;
    }

    playTone({ frequency, durationMs, type = 'square', gain = 0.12, output = 'sfx' }) {
        if (!this.ctx) return;
        const destinationGain = output === 'music' ? this.musicGain : this.sfxGain;
        if (!destinationGain || destinationGain.gain.value <= 0) return;

        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(frequency, now);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

        osc.connect(g);
        g.connect(destinationGain);

        osc.start(now);
        osc.stop(now + durationMs / 1000 + 0.02);
    }

    playSfx(name) {
        if (!this.ctx) return;
        this.syncGains();

        if (name === 'flap') {
            this.playTone({ frequency: 660, durationMs: 70, type: 'square', gain: 0.12 });
            this.playTone({ frequency: 880, durationMs: 40, type: 'square', gain: 0.07 });
            return;
        }
        if (name === 'score') {
            this.playTone({ frequency: 988, durationMs: 60, type: 'triangle', gain: 0.10 });
            this.playTone({ frequency: 1319, durationMs: 70, type: 'triangle', gain: 0.08 });
            return;
        }
        if (name === 'hit') {
            this.playTone({ frequency: 180, durationMs: 120, type: 'sawtooth', gain: 0.13 });
            return;
        }
        if (name === 'die') {
            this.playTone({ frequency: 220, durationMs: 220, type: 'sawtooth', gain: 0.11 });
            this.playTone({ frequency: 110, durationMs: 260, type: 'sawtooth', gain: 0.09 });
            return;
        }
        if (name === 'ui') {
            this.playTone({ frequency: 740, durationMs: 55, type: 'square', gain: 0.08 });
        }
    }

    startMusic() {
        this.ensureContext();
        if (!this.ctx) return;

        this.syncGains();
        if (this.musicTimer) return;

        const stepMs = 180;
        const scale = [261.63, 293.66, 329.63, 392.0, 440.0]; // C D E G A

        this.musicTimer = window.setInterval(() => {
            if (!this.ctx) return;
            this.syncGains();
            if (!this.musicGain || this.musicGain.gain.value <= 0) return;

            const idx = (this.musicSeed++ + ((Date.now() / stepMs) | 0)) % scale.length;
            const base = scale[(idx + 1) % scale.length];
            const harmony = scale[(idx + 3) % scale.length];

            this.playTone({ frequency: base, durationMs: 120, type: 'triangle', gain: 0.06, output: 'music' });
            if ((this.musicSeed % 3) === 0) {
                this.playTone({ frequency: harmony, durationMs: 120, type: 'triangle', gain: 0.04, output: 'music' });
            }
        }, stepMs);
    }

    stopMusic() {
        if (this.musicTimer) {
            window.clearInterval(this.musicTimer);
            this.musicTimer = null;
        }
    }
}

/**
 * FlappyBird - single-file, lightweight Flappy Bird clone.
 * The class encapsulates game state, rendering and input handling.
 */
class FlappyBird {
    constructor() {
        this.root = document.getElementById('gameRoot') || document.querySelector('.game-container');
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Logical canvas resolution (kept fixed for pixelated rendering)
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
        
        // Game state
        this.gameState = 'start';
        this.hasStartedPlaying = false; // New flag for first interaction
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('flappyHighScore')) || 0;

        this.userSettings = this.loadUserSettings();
        this.audio = new AudioSystem(() => this.userSettings);
        this.profile = this.loadProfile();

        this.themes = this.createThemes();
        this.themeId = this.userSettings.themeId || 'day';
        this.currentTheme = this.themes[this.themeId] || this.themes.day;
        
        // Bird properties
        // Bird state
        this.bird = {
            x: 100,
            y: CANVAS_HEIGHT / 2,
            width: 27,
            height: 27,
            velocity: 0,
            gravity: 0.5,
            jumpForce: -8,
            rotation: 0
        };
        
        // Game settings
        // Core gameplay settings (tweak these to change feel)
        this.settings = {
            pipeGap: 135,
            pipeWidth: 52,
            pipeSpawnInterval: 1700,
            scrollSpeed: 2.6,
            groundHeight: 112,
            groundSpeed: 2.5,
            groundX: 0
        };
        
        // Advanced pipe generation settings
        this.pipeSettings = {
            baseGap: 120,           // Starting gap between pipes
            minGap: 90,            // Minimum gap allowed
            gapReductionRate: 0.1,  // How much to reduce gap per point
            baseSpeed: 2.5,         // Starting speed
            maxSpeed: 3.5,          // Maximum speed
            speedIncreaseRate: 0.02, // How much to increase speed per point
            minHeight: 50,          // Minimum pipe height
            maxHeight: 320,         // Maximum pipe height
            smoothingFactor: 0.3,   // How much to smooth height differences
            lastHeight: 200,        // Track last pipe height for smoothing
            difficultyStartScore: 10 // When to start increasing difficulty
        };

        // Initialize difficulty tracking
        // Difficulty state (dynamically adjusted)
        this.currentDifficulty = {
            gap: this.pipeSettings.baseGap,
            speed: this.pipeSettings.baseSpeed,
            heightVariance: 100
        };
        
        // Game objects
        this.pipes = [];
        this.lastPipeSpawn = 0;
        this.frameCount = 0;
        
        // Background elements
        this.bgElements = {
            groundPattern: null,
            skyColor: '#4EC0CA',
            skyColorBottom: '#7DD5DE',
            groundColor: '#DED895',
            pipeColors: {
                top: '#74BF2E',
                bottom: '#74BF2E',
                border: '#558022',
                highlight: '#98DE5B'
            }
        };

        this.applyTheme(this.themeId);

        // Juice (particles + camera shake)
        this.particles = [];
        this.cameraShake = { strength: 0, until: 0 };

        this.weatherParticles = [];

        // Currency / pickups
        this.pickups = [];
        this.nextCoinAfterScore = 2;
        
        // Load images
    this.images = {};
    this.loadImages();
        
        // Input handling
        this.init();
        
        // Start game loop
        this.lastTime = 0;
        requestAnimationFrame(this.gameLoop.bind(this));
    }
    
    loadImages() {
        const imageNames = ['bird', 'pipe', 'background'];
        let loadedImages = 0;
        
        imageNames.forEach(name => {
            this.images[name] = new Image();
            this.images[name].onload = () => {
                loadedImages++;
                if (loadedImages === imageNames.length) {
                    this.draw(); // Initial draw when all images are loaded
                }
            };
            // Use colored rectangles for now, replace with actual images later
            this.images[name].src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
        });
    }
    
    init() {
        // Get UI elements
        this.startScreen = document.getElementById('start-screen');
        this.gameScreen = document.getElementById('game-screen');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.scoreElement = document.getElementById('score');
        this.finalScoreElement = document.getElementById('finalScore');
        this.bestScoreElement = document.getElementById('bestScore');
        this.highScoreElement = document.getElementById('highScore');

        // HUD
        this.btnMenu = document.getElementById('btnMenu');
        
        // Start/settings
        this.btnStart = document.getElementById('btnStart');
        this.btnMarketplaceStart = document.getElementById('btnMarketplaceStart');
        this.btnRetry = document.getElementById('btnRetry');
        this.btnHomeFromOver = document.getElementById('btnHomeFromOver');
        this.settingSfx = document.getElementById('settingSfx');
        this.settingMusic = document.getElementById('settingMusic');
        this.settingMute = document.getElementById('settingMute');
        this.settingTheme = document.getElementById('settingTheme');
        this.settingWeather = document.getElementById('settingWeather');
        this.settingBirdSkin = document.getElementById('settingBirdSkin');
        this.settingTrail = document.getElementById('settingTrail');
        this.walletCoins = document.getElementById('walletCoins');
        this.btnBuySelected = document.getElementById('btnBuySelected');

        this.settingsModal = document.getElementById('settings-modal');
        this.btnCloseSettings = document.getElementById('btnCloseSettings');
        this.btnResume = document.getElementById('btnResume');
        this.btnRestart = document.getElementById('btnRestart');
        this.btnOpenMarketplace = document.getElementById('btnOpenMarketplace');

        this.marketplaceModal = document.getElementById('marketplace-modal');
        this.btnCloseMarketplace = document.getElementById('btnCloseMarketplace');
        this.btnBackToSettings = document.getElementById('btnBackToSettings');

        // Set up event listeners for both mouse/touch and keyboard
        this.setupControls();
        this.setupHud();
        this.setupStartMenu();
        this.syncHud();

        // Start game loop
        this.lastTime = 0;
    }

    loadUserSettings() {
        const defaults = {
            masterMuted: false,
            sfxEnabled: true,
            musicEnabled: false,
            sfxVolume: 0.65,
            musicVolume: 0.22,
            themeId: 'day',
            weatherId: 'none',
            birdSkinId: 'classic',
            trailId: 'none'
        };

        try {
            const raw = localStorage.getItem('flappySettings');
            if (!raw) return { ...defaults };
            const parsed = JSON.parse(raw);
            return { ...defaults, ...parsed };
        } catch {
            return { ...defaults };
        }
    }

    createThemes() {
        return {
            day: {
                id: 'day',
                skyTop: '#4EC0CA',
                skyBottom: '#7DD5DE',
                ground: '#DED895',
                pipeColors: { top: '#74BF2E', bottom: '#74BF2E', border: '#558022', highlight: '#98DE5B' },
                bird: { body: '#FFD70D', wing: '#FFFFFF', beak: '#FFA500', eye: '#000000' },
                cloudAlpha: 0.8
            },
            night: {
                id: 'night',
                skyTop: '#0B1B3A',
                skyBottom: '#163B6F',
                ground: '#BFAE73',
                pipeColors: { top: '#4FB34A', bottom: '#4FB34A', border: '#2E6C2B', highlight: '#7BE977' },
                bird: { body: '#FFD70D', wing: '#EAF2FF', beak: '#FFA500', eye: '#000000' },
                cloudAlpha: 0.35
            },
            sunset: {
                id: 'sunset',
                skyTop: '#FF7A59',
                skyBottom: '#FFD56A',
                ground: '#E7D18E',
                pipeColors: { top: '#5FBF8E', bottom: '#5FBF8E', border: '#2D6B52', highlight: '#9FF0C9' },
                bird: { body: '#FFE26A', wing: '#FFFFFF', beak: '#FF8A3D', eye: '#000000' },
                cloudAlpha: 0.65
            },
            storm: {
                id: 'storm',
                skyTop: '#22314A',
                skyBottom: '#3E5879',
                ground: '#B8B08A',
                pipeColors: { top: '#6AA84F', bottom: '#6AA84F', border: '#3E6A2E', highlight: '#9CE37B' },
                bird: { body: '#FFD70D', wing: '#F1F6FF', beak: '#FFA500', eye: '#000000' },
                cloudAlpha: 0.3
            }
        };
    }

    applyTheme(themeId) {
        const theme = this.themes[themeId] || this.themes.day;
        this.themeId = theme.id;
        this.currentTheme = theme;

        if (this.userSettings) this.userSettings.themeId = theme.id;

        if (this.bgElements) {
            this.bgElements.skyColor = theme.skyTop;
            this.bgElements.skyColorBottom = theme.skyBottom;
            this.bgElements.groundColor = theme.ground;
            this.bgElements.pipeColors = { ...theme.pipeColors };
        }
    }

    getBirdSkins() {
        return [
            { id: 'classic', name: 'CLASSIC', price: 0, colors: { body: '#FFD70D', wing: '#FFFFFF', beak: '#FFA500', eye: '#000000' } },
            { id: 'cyan', name: 'CYAN', price: 60, colors: { body: '#55DDE0', wing: '#EAFBFF', beak: '#FFA500', eye: '#000000' } },
            { id: 'rose', name: 'ROSE', price: 90, colors: { body: '#FF6FAE', wing: '#FFFFFF', beak: '#FFA500', eye: '#000000' } },
            { id: 'void', name: 'VOID', price: 140, colors: { body: '#2C2C2C', wing: '#BDBDBD', beak: '#C97C2E', eye: '#000000' } }
        ];
    }

    getTrails() {
        return [
            { id: 'none', name: 'NONE', price: 0 },
            { id: 'sparkle', name: 'SPARKLE', price: 80 },
            { id: 'flame', name: 'FLAME', price: 120 }
        ];
    }

    populateMarketplaceOptions() {
        if (this.settingBirdSkin) {
            const skins = this.getBirdSkins();
            this.settingBirdSkin.innerHTML = '';
            for (const skin of skins) {
                const owned = this.profile.ownedBirdSkins.includes(skin.id);
                const opt = document.createElement('option');
                opt.value = skin.id;
                opt.textContent = owned ? skin.name : `${skin.name} (${skin.price})`;
                this.settingBirdSkin.appendChild(opt);
            }
        }

        if (this.settingTrail) {
            const trails = this.getTrails();
            this.settingTrail.innerHTML = '';
            for (const trail of trails) {
                const owned = this.profile.ownedTrails.includes(trail.id);
                const opt = document.createElement('option');
                opt.value = trail.id;
                opt.textContent = owned ? trail.name : `${trail.name} (${trail.price})`;
                this.settingTrail.appendChild(opt);
            }
        }
    }

    updateWalletUi() {
        if (this.walletCoins) this.walletCoins.textContent = String(this.profile.coins || 0);
    }

    updateBuyEquipCta() {
        if (!this.btnBuySelected) return;

        const skinId = this.settingBirdSkin ? this.settingBirdSkin.value : (this.userSettings.birdSkinId || 'classic');
        const trailId = this.settingTrail ? this.settingTrail.value : (this.userSettings.trailId || 'none');

        const skin = this.getBirdSkins().find(s => s.id === skinId) || this.getBirdSkins()[0];
        const trail = this.getTrails().find(t => t.id === trailId) || this.getTrails()[0];

        const skinOwned = this.profile.ownedBirdSkins.includes(skin.id);
        const trailOwned = this.profile.ownedTrails.includes(trail.id);

        let total = 0;
        if (!skinOwned) total += skin.price || 0;
        if (!trailOwned) total += trail.price || 0;

        if (total > 0) {
            this.btnBuySelected.textContent = `BUY (${total})`;
        } else {
            this.btnBuySelected.textContent = 'EQUIP';
        }
    }

    buyOrEquipSelected() {
        const skinId = this.settingBirdSkin ? this.settingBirdSkin.value : (this.userSettings.birdSkinId || 'classic');
        const trailId = this.settingTrail ? this.settingTrail.value : (this.userSettings.trailId || 'none');

        const skin = this.getBirdSkins().find(s => s.id === skinId) || this.getBirdSkins()[0];
        const trail = this.getTrails().find(t => t.id === trailId) || this.getTrails()[0];

        const needToBuy = [];
        if (!this.profile.ownedBirdSkins.includes(skin.id)) needToBuy.push({ kind: 'skin', item: skin });
        if (!this.profile.ownedTrails.includes(trail.id)) needToBuy.push({ kind: 'trail', item: trail });

        let total = 0;
        for (const n of needToBuy) total += n.item.price || 0;

        if (total > 0) {
            if ((this.profile.coins || 0) < total) {
                this.audio.playSfx('hit');
                return;
            }
            this.profile.coins -= total;
            for (const n of needToBuy) {
                if (n.kind === 'skin') this.profile.ownedBirdSkins.push(n.item.id);
                if (n.kind === 'trail') this.profile.ownedTrails.push(n.item.id);
            }
            this.saveProfile();
            this.updateWalletUi();
            this.populateMarketplaceOptions();
        }

        // Equip
        this.userSettings.birdSkinId = skin.id;
        this.userSettings.trailId = trail.id;
        this.saveUserSettings();
        this.updateBuyEquipCta();
        this.audio.playSfx('ui');
    }

    saveUserSettings() {
        try {
            localStorage.setItem('flappySettings', JSON.stringify(this.userSettings));
        } catch {
            // Ignore (storage may be disabled).
        }
        this.audio.syncGains();
        if (this.userSettings.masterMuted || !this.userSettings.musicEnabled) {
            this.audio.stopMusic();
        }
    }

    loadProfile() {
        const defaults = {
            coins: 0,
            ownedBirdSkins: ['classic'],
            ownedTrails: ['none'],
            ownedThemes: ['day', 'night', 'sunset', 'storm']
        };

        try {
            const raw = localStorage.getItem('flappyProfile');
            if (!raw) return { ...defaults };
            const parsed = JSON.parse(raw);
            return { ...defaults, ...parsed };
        } catch {
            return { ...defaults };
        }
    }

    saveProfile() {
        try {
            localStorage.setItem('flappyProfile', JSON.stringify(this.profile));
        } catch {
            // Ignore.
        }
    }

    shake(strength, durationMs) {
        const now = performance.now();
        const nextStrength = Math.max(this.cameraShake.strength || 0, strength);
        this.cameraShake = {
            strength: nextStrength,
            start: now,
            duration: Math.max(1, durationMs)
        };
    }

    spawnParticles(count, x, y, options = {}) {
        const {
            baseSpeed = 1.8,
            spread = Math.PI * 2,
            lifeMs = 400,
            color = '#FFFFFF',
            gravity = 0.03,
            size = 2
        } = options;

        for (let i = 0; i < count; i++) {
            const angle = (Math.random() - 0.5) * spread;
            const speed = baseSpeed * (0.6 + Math.random() * 0.8);
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                g: gravity,
                size: size * (0.8 + Math.random() * 0.8),
                color,
                born: performance.now(),
                life: lifeMs * (0.7 + Math.random() * 0.6)
            });
        }
    }

    updateParticles() {
        const now = performance.now();
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            const age = now - p.born;
            if (age >= p.life) {
                this.particles.splice(i, 1);
                continue;
            }
            p.vy += p.g;
            p.x += p.vx;
            p.y += p.vy;
        }
    }

    drawParticles() {
        if (this.particles.length === 0) return;
        const now = performance.now();
        for (const p of this.particles) {
            const t = Math.min(1, (now - p.born) / p.life);
            this.ctx.globalAlpha = 1 - t;
            this.ctx.fillStyle = p.color;
            this.ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        this.ctx.globalAlpha = 1;
    }

    spawnWeather(deltaTime) {
        const mode = this.userSettings.weatherId || 'none';
        if (mode === 'none') return;

        const spawnRate = mode === 'rain' ? 0.14 : 0.08; // per ms
        const toSpawn = Math.floor(deltaTime * spawnRate);
        for (let i = 0; i < toSpawn; i++) {
            if (mode === 'rain') {
                this.weatherParticles.push({
                    x: Math.random() * this.canvas.width,
                    y: -10,
                    vx: -0.5 + Math.random() * 0.2,
                    vy: 6 + Math.random() * 3,
                    len: 10 + Math.random() * 10
                });
            } else if (mode === 'snow') {
                this.weatherParticles.push({
                    x: Math.random() * this.canvas.width,
                    y: -10,
                    vx: -0.6 + Math.random() * 1.2,
                    vy: 1.2 + Math.random() * 1.2,
                    r: 1 + Math.random() * 2
                });
            }
        }

        for (let i = this.weatherParticles.length - 1; i >= 0; i--) {
            const w = this.weatherParticles[i];
            w.x += w.vx;
            w.y += w.vy;
            if (w.y > this.canvas.height + 20) this.weatherParticles.splice(i, 1);
        }
    }

    drawWeather() {
        const mode = this.userSettings.weatherId || 'none';
        if (mode === 'none' || this.weatherParticles.length === 0) return;

        if (mode === 'rain') {
            this.ctx.globalAlpha = 0.55;
            this.ctx.strokeStyle = '#CFE9FF';
            this.ctx.lineWidth = 2;
            for (const w of this.weatherParticles) {
                this.ctx.beginPath();
                this.ctx.moveTo(w.x, w.y);
                this.ctx.lineTo(w.x + w.vx * 2, w.y + w.len);
                this.ctx.stroke();
            }
            this.ctx.globalAlpha = 1;
            return;
        }

        if (mode === 'snow') {
            this.ctx.globalAlpha = 0.75;
            this.ctx.fillStyle = '#FFFFFF';
            for (const w of this.weatherParticles) {
                this.ctx.beginPath();
                this.ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.globalAlpha = 1;
        }
    }

    updatePickups() {
        // Move pickups and check collision with bird.
        for (let i = this.pickups.length - 1; i >= 0; i--) {
            const p = this.pickups[i];
            p.x -= this.settings.scrollSpeed;

            // Offscreen
            if (p.x + p.r < -20) {
                this.pickups.splice(i, 1);
                continue;
            }

            if (this.checkPickupCollision(p)) {
                this.collectPickup(p);
                this.pickups.splice(i, 1);
            }
        }
    }

    checkPickupCollision(p) {
        const birdBox = {
            x: this.bird.x,
            y: this.bird.y,
            width: this.bird.width,
            height: this.bird.height
        };

        const closestX = Math.max(birdBox.x, Math.min(p.x, birdBox.x + birdBox.width));
        const closestY = Math.max(birdBox.y, Math.min(p.y, birdBox.y + birdBox.height));
        const dx = p.x - closestX;
        const dy = p.y - closestY;
        return (dx * dx + dy * dy) <= (p.r * p.r);
    }

    collectPickup(p) {
        if (p.costScore && this.score < p.costScore) {
            // Not enough score to pay the cost; ignore pickup.
            this.audio.playSfx('hit');
            return;
        }

        if (p.costScore) {
            this.score = Math.max(0, this.score - p.costScore);
            this.updateScore();
        }

        this.profile.coins = (this.profile.coins || 0) + (p.value || 0);
        this.saveProfile();
        this.updateWalletUi();

        this.audio.playSfx('score');
        this.spawnParticles(p.kind === 'rainbow' ? 22 : 10, p.x, p.y, {
            baseSpeed: p.kind === 'rainbow' ? 3.2 : 2.2,
            spread: Math.PI * 2,
            lifeMs: p.kind === 'rainbow' ? 700 : 420,
            color: p.kind === 'rainbow' ? '#FFFFFF' : '#FFE26A',
            gravity: 0.04,
            size: 2
        });
    }

    drawPickups() {
        for (const p of this.pickups) {
            if (p.kind === 'coin') {
                this.ctx.fillStyle = '#FFD700';
                this.ctx.strokeStyle = '#543847';
                this.ctx.lineWidth = 2;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.stroke();
                continue;
            }

            // Rainbow bonus coin
            const grad = this.ctx.createLinearGradient(p.x - p.r, p.y - p.r, p.x + p.r, p.y + p.r);
            grad.addColorStop(0, '#FF4D4D');
            grad.addColorStop(0.25, '#FFA500');
            grad.addColorStop(0.5, '#FFE26A');
            grad.addColorStop(0.75, '#55DDE0');
            grad.addColorStop(1, '#9B59FF');
            this.ctx.fillStyle = grad;
            this.ctx.strokeStyle = '#543847';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.stroke();
        }
    }

    setupHud() {
        if (this.btnMenu) {
            this.btnMenu.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.audio.unlock();
                this.openPauseMenu();
                this.audio.playSfx('ui');
            });
        }
    }

    syncHud() {
        if (this.btnMenu) {
            const shouldShow = this.gameState === 'playing' || this.gameState === 'paused';
            this.btnMenu.classList.toggle('hidden', !shouldShow);
        }
    }

    setupStartMenu() {
        if (this.settingSfx) this.settingSfx.checked = !!this.userSettings.sfxEnabled;
        if (this.settingMusic) this.settingMusic.checked = !!this.userSettings.musicEnabled;
        if (this.settingMute) this.settingMute.checked = !!this.userSettings.masterMuted;
        if (this.settingTheme) this.settingTheme.value = this.userSettings.themeId || 'day';
        if (this.settingWeather) this.settingWeather.value = this.userSettings.weatherId || 'none';

        if (this.settingSfx) {
            this.settingSfx.addEventListener('change', async () => {
                await this.audio.unlock();
                this.userSettings.sfxEnabled = !!this.settingSfx.checked;
                this.saveUserSettings();
                this.audio.playSfx('ui');
            });
        }

        if (this.settingMusic) {
            this.settingMusic.addEventListener('change', async () => {
                await this.audio.unlock();
                this.userSettings.musicEnabled = !!this.settingMusic.checked;
                this.saveUserSettings();
                if (this.userSettings.musicEnabled) this.audio.startMusic();
                else this.audio.stopMusic();
                this.audio.playSfx('ui');
            });
        }

        if (this.settingMute) {
            this.settingMute.addEventListener('change', async () => {
                await this.audio.unlock();
                this.userSettings.masterMuted = !!this.settingMute.checked;
                this.saveUserSettings();
                this.audio.playSfx('ui');
            });
        }

        if (this.settingTheme) {
            this.settingTheme.addEventListener('change', async () => {
                await this.audio.unlock();
                this.userSettings.themeId = this.settingTheme.value;
                this.applyTheme(this.userSettings.themeId);
                this.saveUserSettings();
                this.audio.playSfx('ui');
            });
        }

        if (this.settingWeather) {
            this.settingWeather.addEventListener('change', async () => {
                await this.audio.unlock();
                this.userSettings.weatherId = this.settingWeather.value;
                this.saveUserSettings();
                this.audio.playSfx('ui');
            });
        }

        this.populateMarketplaceOptions();
        this.updateWalletUi();

        if (this.settingBirdSkin) {
            this.settingBirdSkin.addEventListener('change', () => {
                this.updateBuyEquipCta();
            });
        }

        if (this.settingTrail) {
            this.settingTrail.addEventListener('change', () => {
                this.updateBuyEquipCta();
            });
        }

        if (this.btnBuySelected) {
            this.btnBuySelected.addEventListener('click', (e) => {
                e.preventDefault();
                this.buyOrEquipSelected();
            });
        }

        if (this.btnCloseSettings) {
            this.btnCloseSettings.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeAllMenus({ resumeIfPaused: false });
            });
        }

        if (this.settingsModal) {
            this.settingsModal.addEventListener('click', (e) => {
                const target = e.target;
                if (target && target.dataset && target.dataset.close === 'true') {
                    this.closeAllMenus({ resumeIfPaused: false });
                }
            });
        }

        if (this.btnResume) {
            this.btnResume.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeAllMenus({ resumeIfPaused: true });
            });
        }

        if (this.btnRestart) {
            this.btnRestart.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeAllMenus({ resumeIfPaused: false });
                this.startGame();
            });
        }

        if (this.btnOpenMarketplace) {
            this.btnOpenMarketplace.addEventListener('click', (e) => {
                e.preventDefault();
                this.openMarketplace();
            });
        }

        if (this.btnRetry) {
            this.btnRetry.addEventListener('click', (e) => {
                e.preventDefault();
                this.startGame();
            });
        }

        if (this.btnHomeFromOver) {
            this.btnHomeFromOver.addEventListener('click', (e) => {
                e.preventDefault();
                this.resetGame();
            });
        }

        if (this.btnCloseMarketplace) {
            this.btnCloseMarketplace.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeMarketplace();
            });
        }

        if (this.btnBackToSettings) {
            this.btnBackToSettings.addEventListener('click', (e) => {
                e.preventDefault();
                this.closeMarketplace();
                this.openPauseMenu();
            });
        }

        if (this.marketplaceModal) {
            this.marketplaceModal.addEventListener('click', (e) => {
                const target = e.target;
                if (target && target.dataset && target.dataset.close === 'true') {
                    this.closeMarketplace();
                }
            });
        }

        if (this.btnStart) {
            this.btnStart.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.handleInput();
            });
        }

        if (this.btnMarketplaceStart) {
            this.btnMarketplaceStart.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.audio.unlock();
                this.openMarketplace();
                this.audio.playSfx('ui');
            });
        }
    }

    isInteractiveTarget(target) {
        if (!target || !target.closest) return false;
        return !!target.closest('button, input, label, select, option, a');
    }

    isSettingsOpen() {
        return !!(this.settingsModal && !this.settingsModal.classList.contains('hidden'));
    }

    isMarketplaceOpen() {
        return !!(this.marketplaceModal && !this.marketplaceModal.classList.contains('hidden'));
    }

    openPauseMenu() {
        if (!this.settingsModal) return;

        if (this.gameState === 'start') return;
        if (this.gameState === 'gameOver') return;

        if (this.gameState === 'playing') this.pauseGame();

        this.root?.classList.add('is-blurred');
        this.settingsModal.classList.remove('hidden');

        const canResume = this.gameState === 'paused';
        if (this.btnResume) this.btnResume.classList.toggle('hidden', !canResume);
        if (this.btnRestart) this.btnRestart.classList.toggle('hidden', !canResume && this.gameState !== 'gameOver');
        if (this.btnOpenMarketplace) this.btnOpenMarketplace.classList.toggle('hidden', !(this.gameState === 'start' || this.gameState === 'paused' || this.gameState === 'gameOver'));

        if (this.settingSfx) this.settingSfx.checked = !!this.userSettings.sfxEnabled;
        if (this.settingMusic) this.settingMusic.checked = !!this.userSettings.musicEnabled;
        if (this.settingMute) this.settingMute.checked = !!this.userSettings.masterMuted;
    }

    openMarketplace() {
        if (!this.marketplaceModal) return;
        if (!(this.gameState === 'start' || this.gameState === 'paused' || this.gameState === 'gameOver')) return;

        if (this.gameState === 'playing') this.pauseGame();

        this.root?.classList.add('is-blurred');
        this.marketplaceModal.classList.remove('hidden');
        if (this.settingTheme) this.settingTheme.value = this.userSettings.themeId || 'day';
        if (this.settingWeather) this.settingWeather.value = this.userSettings.weatherId || 'none';
        if (this.settingBirdSkin) this.settingBirdSkin.value = this.userSettings.birdSkinId || 'classic';
        if (this.settingTrail) this.settingTrail.value = this.userSettings.trailId || 'none';
        this.populateMarketplaceOptions();
        this.updateWalletUi();
        this.updateBuyEquipCta();
    }

    closeMarketplace() {
        if (!this.marketplaceModal) return;
        this.marketplaceModal.classList.add('hidden');
        if (!this.isSettingsOpen()) {
            this.root?.classList.remove('is-blurred');
        }
    }

    closeAllMenus({ resumeIfPaused }) {
        if (this.settingsModal) this.settingsModal.classList.add('hidden');
        if (this.marketplaceModal) this.marketplaceModal.classList.add('hidden');
        this.root?.classList.remove('is-blurred');

        if (resumeIfPaused) this.resumeGame();
    }

    setupControls() {
        const inputTarget = this.root || this.canvas;

        inputTarget.addEventListener('pointerdown', (e) => {
            if (this.isSettingsOpen() || this.isMarketplaceOpen()) return;
            if (this.isInteractiveTarget(e.target)) return;
            if (e.pointerType === 'touch') e.preventDefault();
            this.handleInput();
        }, { passive: false });

        // Keyboard events
        window.addEventListener('keydown', (e) => {
            // Accept keyboard Space key (and fallback to ' ' char)
            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                this.handleInput();
                return;
            }

            if (e.code === 'KeyP' || e.code === 'Escape') {
                e.preventDefault();
                this.openPauseMenu();
                return;
            }

            if (e.code === 'KeyR' || e.code === 'Enter') {
                if (this.gameState === 'gameOver') {
                    e.preventDefault();
                    this.startGame();
                }
                return;
            }

            if (e.code === 'KeyM') {
                e.preventDefault();
                this.userSettings.masterMuted = !this.userSettings.masterMuted;
                if (this.settingMute) this.settingMute.checked = !!this.userSettings.masterMuted;
                this.saveUserSettings();
                this.syncHud();
                return;
            }

            if (e.code === 'KeyS') {
                e.preventDefault();
                if (this.isSettingsOpen() || this.isMarketplaceOpen()) this.closeAllMenus({ resumeIfPaused: false });
                else this.openPauseMenu();
            }
        });

        inputTarget.addEventListener('touchmove', (e) => {
            e.preventDefault();
        }, { passive: false });

        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.gameState === 'playing') {
                this.pauseGame();
            }
        });

        // Handle window resize
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });

        // Initial resize
        this.resizeCanvas();
    }

    async handleInput() {
        await this.audio.unlock();
        if (this.userSettings.musicEnabled) this.audio.startMusic();

        switch (this.gameState) {
            case 'start':
                this.startGame();
                this.birdJump();
                break;
            case 'playing':
                this.birdJump();
                break;
            case 'paused':
                this.resumeGame();
                break;
            case 'gameOver':
                this.startGame();
                break;
        }
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Maintain aspect ratio
        const gameAspectRatio = CANVAS_WIDTH / CANVAS_HEIGHT;
        const containerAspectRatio = containerWidth / containerHeight;
        
        let newWidth, newHeight;
        
        if (containerAspectRatio > gameAspectRatio) {
            newHeight = containerHeight;
            newWidth = containerHeight * gameAspectRatio;
        } else {
            newWidth = containerWidth;
            newHeight = containerWidth / gameAspectRatio;
        }
        
        this.canvas.style.width = `${newWidth}px`;
        this.canvas.style.height = `${newHeight}px`;
        
        // Keep canvas resolution sharp
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
    }

    pauseGame() {
        if (this.gameState === 'playing') {
            this.gameState = 'paused';
        }
    }

    resumeGame() {
        if (this.gameState === 'paused') {
            this.gameState = 'playing';
        }
    }
    
    startGame() {
        this.gameState = 'playing';
        this.score = 0;
        this.bird.y = CANVAS_HEIGHT / 2;
        this.bird.velocity = 0;
        this.pipes = [];
        this.lastPipeSpawn = 0;
        this.hasStartedPlaying = false;
        
        this.startScreen.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        this.updateScore();
        this.syncHud();
        this.audio.playSfx('ui');
        this.closeAllMenus({ resumeIfPaused: false });
    }
    
    resetGame() {
        this.gameState = 'start';
        this.startScreen.classList.remove('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.closeAllMenus({ resumeIfPaused: false });
        this.syncHud();
    }
    
    birdJump() {
        if (this.gameState === 'playing') {
            if (!this.hasStartedPlaying) {
                this.hasStartedPlaying = true;
                this.lastPipeSpawn = 0;
            }
            this.bird.velocity = this.bird.jumpForce;
            this.audio.playSfx('flap');
            this.spawnParticles(10, this.bird.x - 4, this.bird.y + this.bird.height / 2, {
                baseSpeed: 2.2,
                spread: Math.PI,
                lifeMs: 320,
                color: '#FFFFFF',
                gravity: 0.06,
                size: 2
            });

            if ((this.userSettings.trailId || 'none') !== 'none') {
                const trailColor = this.userSettings.trailId === 'flame' ? '#FFA500' : '#FFFFFF';
                this.spawnParticles(6, this.bird.x - 6, this.bird.y + this.bird.height / 2, {
                    baseSpeed: 1.6,
                    spread: Math.PI,
                    lifeMs: 260,
                    color: trailColor,
                    gravity: 0.05,
                    size: 2
                });
            }
        }
    }
    
    updateBird(deltaTime) {
        if (this.gameState !== 'playing') return;

        if (!this.hasStartedPlaying) {
            // Hover animation before first interaction
            this.bird.y = CANVAS_HEIGHT / 2 + Math.sin(Date.now() / 400) * 8;
            return;
        }

        // Normal physics after first interaction
        this.bird.velocity += this.bird.gravity;
        this.bird.y += this.bird.velocity;
        
        // Update rotation based on velocity
        if (this.bird.velocity < 0) {
            this.bird.rotation = -25; // Point up when jumping
        } else {
            if (this.bird.rotation < 90) {
                this.bird.rotation += 4; // Rotate downward faster
            }
        }
        
        // Bounds checking
        if (this.bird.y < 0) {
            this.bird.y = 0;
            this.bird.velocity = 0;
        }
        
        if (this.bird.y + this.bird.height > this.canvas.height - this.settings.groundHeight) {
            this.gameOver();
        }
    }
    
    updateDifficulty() {
        if (this.score < this.pipeSettings.difficultyStartScore) {
            return;
        }

        // Calculate progress factor (0 to 1)
        const progressFactor = Math.min(
            (this.score - this.pipeSettings.difficultyStartScore) / 100,
            1
        );

        // Smoothly adjust gap
        const targetGap = Math.max(
            this.pipeSettings.minGap,
            this.pipeSettings.baseGap - (this.pipeSettings.gapReductionRate * this.score)
        );
        this.currentDifficulty.gap = this.currentDifficulty.gap * 0.95 + targetGap * 0.05;

        // Smoothly adjust speed
        const targetSpeed = Math.min(
            this.pipeSettings.maxSpeed,
            this.pipeSettings.baseSpeed + (this.pipeSettings.speedIncreaseRate * this.score)
        );
        this.currentDifficulty.speed = this.currentDifficulty.speed * 0.95 + targetSpeed * 0.05;

        // Increase height variance based on score
        this.currentDifficulty.heightVariance = 100 + (progressFactor * 100);

        // Update game settings
        this.settings.pipeGap = this.currentDifficulty.gap;
        this.settings.scrollSpeed = this.currentDifficulty.speed;
        this.settings.groundSpeed = this.currentDifficulty.speed;
    }

    generatePipeHeight() {
        const availableHeight = this.canvas.height - this.settings.groundHeight - this.settings.pipeGap;

        // Keep pipes a safe distance from top/bottom
        const min = 60;
        const max = Math.max(min + 10, availableHeight - 60);

        // Random height with gentle smoothing to avoid abrupt changes
        let newHeight = min + Math.random() * (max - min);
        newHeight = this.pipeSettings.lastHeight * 0.25 + newHeight * 0.75;
        this.pipeSettings.lastHeight = newHeight;
        return newHeight;
    }


    spawnPipe() {
        const topHeight = this.generatePipeHeight();
        
        this.pipes.push({
            x: this.canvas.width,
            topHeight: topHeight,
            counted: false
        });
    }

    updatePipes(deltaTime) {
        if (this.gameState !== 'playing' || !this.hasStartedPlaying) {
            return;
        }

        this.lastPipeSpawn += deltaTime;
        if (this.lastPipeSpawn >= this.settings.pipeSpawnInterval) {
            this.spawnPipe();
            this.lastPipeSpawn = 0;
        }
        
        // Update existing pipes
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const pipe = this.pipes[i];
            pipe.x -= this.settings.scrollSpeed;
            
            // Check for score
            if (!pipe.counted && pipe.x + this.settings.pipeWidth < this.bird.x) {
                pipe.counted = true;
                this.score++;
                this.updateScore();
                this.audio.playSfx('score');
                this.spawnParticles(14, this.bird.x + 12, this.bird.y + 6, {
                    baseSpeed: 2.4,
                    spread: Math.PI * 2,
                    lifeMs: 420,
                    color: '#FFE26A',
                    gravity: 0.04,
                    size: 2
                });

                this.maybeSpawnCoinForScore(pipe);
                this.maybeSpawnRainbowBonus();
            }
            
            // Remove off-screen pipes
            if (pipe.x + this.settings.pipeWidth < 0) {
                this.pipes.splice(i, 1);
            }
            
            // Check collision
            if (this.checkCollision(pipe)) {
                this.gameOver();
                break;
            }
        }
    }

    maybeSpawnCoinForScore(pipe) {
        // Spawn regular coins occasionally between the pipes.
        if (this.score < this.nextCoinAfterScore) return;

        const gapTop = pipe.topHeight;
        const gapBottom = pipe.topHeight + this.settings.pipeGap;
        const y = gapTop + (gapBottom - gapTop) * (0.25 + Math.random() * 0.5);
        const x = pipe.x + this.settings.pipeWidth + 50;

        this.pickups.push({
            kind: 'coin',
            x,
            y,
            r: 10,
            value: 3,
            costScore: 0,
            counted: false
        });

        this.nextCoinAfterScore = this.score + 2 + Math.floor(Math.random() * 4);
    }

    maybeSpawnRainbowBonus() {
        // Every 10 pipes, spawn a bonus rainbow coin that costs score points to take.
        if (this.score > 0 && this.score % 10 === 0) {
            const x = this.canvas.width + 40;
            const y = 120 + Math.random() * (this.canvas.height - this.settings.groundHeight - 240);
            this.pickups.push({
                kind: 'rainbow',
                x,
                y,
                r: 12,
                value: 50,
                costScore: 5,
                counted: false
            });
        }
    }
    
    checkCollision(pipe) {
        const birdBox = {
            x: this.bird.x,
            y: this.bird.y,
            width: this.bird.width,
            height: this.bird.height
        };
        
        // Top pipe
        const topPipe = {
            x: pipe.x,
            y: 0,
            width: this.settings.pipeWidth,
            height: pipe.topHeight
        };
        
        // Bottom pipe
        const bottomPipe = {
            x: pipe.x,
            y: pipe.topHeight + this.settings.pipeGap,
            width: this.settings.pipeWidth,
            height: this.canvas.height - (pipe.topHeight + this.settings.pipeGap)
        };
        
        return this.checkBoxCollision(birdBox, topPipe) || 
               this.checkBoxCollision(birdBox, bottomPipe);
    }
    
    checkBoxCollision(box1, box2) {
        return box1.x < box2.x + box2.width &&
               box1.x + box1.width > box2.x &&
               box1.y < box2.y + box2.height &&
               box1.y + box1.height > box2.y;
    }
    
    gameOver() {
        if (this.gameState === 'gameOver') return;
        this.gameState = 'gameOver';
        this.gameScreen.classList.add('hidden');
        this.gameOverScreen.classList.remove('hidden');
        this.syncHud();
        this.closeAllMenus({ resumeIfPaused: false });

        this.audio.playSfx('hit');
        this.audio.playSfx('die');
        this.shake(8, 260);
        this.spawnParticles(26, this.bird.x + 10, this.bird.y + 10, {
            baseSpeed: 3.2,
            spread: Math.PI * 2,
            lifeMs: 620,
            color: '#FFFFFF',
            gravity: 0.08,
            size: 2
        });
        
        // Update scores
        if (this.score > this.highScore) {
            this.highScore = this.score;
            localStorage.setItem('flappyHighScore', this.highScore);
            this.updateHighScore();
        }
        
        // Show medal based on score
        const medal = document.getElementById('medal');
        medal.className = ''; // Reset classes
        
        if (this.score >= 40) {
            medal.classList.add('platinum');
        } else if (this.score >= 30) {
            medal.classList.add('gold');
        } else if (this.score >= 20) {
            medal.classList.add('silver');
        } else if (this.score >= 10) {
            medal.classList.add('bronze');
        } else {
            medal.classList.add('hidden');
        }
        
        this.finalScoreElement.textContent = this.score;
        this.bestScoreElement.textContent = this.highScore;
    }
    
    updateScore() {
        this.scoreElement.textContent = this.score.toString().padStart(3, '0');
        this.scoreElement.classList.remove('point-scored');
        void this.scoreElement.offsetWidth; // Trigger reflow
        this.scoreElement.classList.add('point-scored');
    }
    
    updateHighScore() {
        if (!this.highScoreElement) return;
        this.highScoreElement.textContent = this.highScore.toString().padStart(3, '0');
    }
    
    update(deltaTime) {
        if (this.gameState !== 'playing') return;

        this.updateBird(deltaTime);
        this.updatePipes(deltaTime);
        this.updateDifficulty();  // Add difficulty update
        this.updateParticles();
        this.spawnWeather(deltaTime);
        this.updatePickups();
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Camera shake
        const now = performance.now();
        let shakeX = 0;
        let shakeY = 0;
        if (this.cameraShake && this.cameraShake.strength > 0) {
            const elapsed = now - (this.cameraShake.start || 0);
            const t = Math.min(1, elapsed / Math.max(1, this.cameraShake.duration || 1));
            const s = this.cameraShake.strength * (1 - t);
            shakeX = (Math.random() - 0.5) * s;
            shakeY = (Math.random() - 0.5) * s;
            if (t >= 1) this.cameraShake.strength = 0;
        }

        this.ctx.save();
        this.ctx.translate(shakeX, shakeY);
        
        // Draw sky with gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, this.bgElements.skyColor);
        gradient.addColorStop(1, this.bgElements.skyColorBottom);
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw clouds (simple pixel art style)
        const cloudAlpha = (this.currentTheme && typeof this.currentTheme.cloudAlpha === 'number') ? this.currentTheme.cloudAlpha : 0.8;
        this.ctx.fillStyle = `rgba(255, 255, 255, ${cloudAlpha})`;
        this.drawCloud(100 + Math.sin(Date.now() / 1000) * 30, 100);
        this.drawCloud(300 + Math.cos(Date.now() / 1000) * 30, 180);

        // Weather overlay (behind pipes/bird)
        this.drawWeather();
        
        // Draw pipes
        this.pipes.forEach(pipe => {
            this.drawPipe(pipe.x, 0, pipe.topHeight, true);
            this.drawPipe(pipe.x, pipe.topHeight + this.settings.pipeGap, 
                         this.canvas.height - (pipe.topHeight + this.settings.pipeGap), false);
        });

        // Pickups
        this.drawPickups();
        
        // Draw ground
        this.drawGround();

        // Draw bird
        this.drawBird();

        // Particles (front)
        this.drawParticles();

        this.ctx.restore();
    }

    drawCloud(x, y) {
        // Simple pixel art cloud
        this.ctx.fillRect(x, y, 30, 20);
        this.ctx.fillRect(x - 10, y + 10, 50, 10);
    }
    
    drawPipe(x, y, height, isTop) {
        const width = this.settings.pipeWidth;
        const capHeight = 32;
        const colors = this.bgElements.pipeColors || { top: '#74BF2E', bottom: '#74BF2E', border: '#558022', highlight: '#98DE5B' };
        const bodyColor = isTop ? colors.top : colors.bottom;
        
        // Main pipe body (green)
        this.ctx.fillStyle = bodyColor;
        this.ctx.fillRect(x, y, width, height);
        
        // Lighter highlight
        this.ctx.fillStyle = colors.highlight || '#8FE236';
        this.ctx.fillRect(x + 2, y, width / 3, height);
        
        // Pipe cap
        this.ctx.fillStyle = bodyColor;
        if (isTop) {
            this.ctx.fillRect(x - 3, y + height - capHeight, width + 6, capHeight);
            // Cap highlight
            this.ctx.fillStyle = colors.highlight || '#8FE236';
            this.ctx.fillRect(x - 1, y + height - capHeight, width / 3 + 2, capHeight);
        } else {
            this.ctx.fillRect(x - 3, y, width + 6, capHeight);
            // Cap highlight
            this.ctx.fillStyle = colors.highlight || '#8FE236';
            this.ctx.fillRect(x - 1, y, width / 3 + 2, capHeight);
        }
    }

    drawGround() {
        // Draw scrolling ground
        this.ctx.fillStyle = this.bgElements.groundColor || '#DED895';
        this.ctx.fillRect(0, this.canvas.height - this.settings.groundHeight, 
                         this.canvas.width, this.settings.groundHeight);
        
        // Draw ground pattern
        this.ctx.fillStyle = '#D2691E';
        for (let i = 0; i < this.canvas.width + this.settings.groundSpeed; i += 20) {
            let x = (i - this.settings.groundX) % this.canvas.width;
            if (x < -20) x += this.canvas.width; // normalize negative modulo
            this.ctx.fillRect(x, this.canvas.height - 20, 15, 15);
        }

        // Update ground scroll position
        this.settings.groundX = (this.settings.groundX + this.settings.groundSpeed) % 20;
    }

    drawBird() {
        this.ctx.save();
        this.ctx.translate(
            this.bird.x + this.bird.width / 2,
            this.bird.y + this.bird.height / 2
        );
        
        // Apply rotation
        this.ctx.rotate(this.bird.rotation * Math.PI / 180);
        
        const skins = this.getBirdSkins();
        const selectedSkin = skins.find(s => s.id === (this.userSettings.birdSkinId || 'classic')) || skins[0];
        const birdColors = selectedSkin.colors || ((this.currentTheme && this.currentTheme.bird) ? this.currentTheme.bird : { body: '#FFD70D', wing: '#FFFFFF', beak: '#FFA500', eye: '#000000' });

        // Draw bird body
        this.ctx.fillStyle = birdColors.body;
        this.ctx.fillRect(
            -this.bird.width / 2,
            -this.bird.height / 2,
            this.bird.width,
            this.bird.height
        );
        
        // Draw wing (smoother flapping)
        this.ctx.fillStyle = birdColors.wing;
        const flapPhase = (Math.sin(this.frameCount / 3) + 1) / 2; // 0..1
        const wingHeight = 7 + flapPhase * 6;
        this.ctx.fillRect(
            -this.bird.width / 4,
            0,
            this.bird.width / 2,
            wingHeight
        );
        
        // Draw eye
        this.ctx.fillStyle = birdColors.eye;
        this.ctx.fillRect(
            this.bird.width / 4 - 2,
            -this.bird.height / 4,
            4,
            4
        );
        
        // Draw beak
        this.ctx.fillStyle = birdColors.beak;
        this.ctx.fillRect(
            this.bird.width / 2 - 2,
            -2,
            6,
            4
        );
        
        this.ctx.restore();
        
        this.frameCount++;
    }
    
    gameLoop(timestamp) {
        // Calculate delta time
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        // Update game state
        this.update(deltaTime);
        
        // Draw game
        this.draw();
        
        // Continue game loop
        requestAnimationFrame(this.gameLoop.bind(this));
    }
}

// Start the game when the page loads
window.addEventListener('load', () => {
    new FlappyBird();
});
