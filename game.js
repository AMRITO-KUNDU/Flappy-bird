class FlappyBird {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Set canvas size
        this.canvas.width = 400;
        this.canvas.height = 600;
        
        // Game state
        this.gameState = 'start';
        this.hasStartedPlaying = false; // New flag for first interaction
        this.score = 0;
        this.highScore = parseInt(localStorage.getItem('flappyHighScore')) || 0;
        
        // Bird properties
        this.bird = {
            x: 100,
            y: 300,
            width: 34,
            height: 24,
            velocity: 0,
            gravity: 0.4,
            jumpForce: -6.8,
            rotation: 0,
            flapSpeed: 0.15,
            frame: 0,
            frameCount: 3
        };
        
        // Game settings
        this.settings = {
            pipeGap: 150,
            pipeWidth: 52,
            pipeSpawnInterval: 1800,
            scrollSpeed: 3,
            groundHeight: 112,
            groundSpeed: 3,
            groundX: 0
        };
        
        // Game objects
        this.pipes = [];
        this.lastPipeSpawn = 0;
        this.frameCount = 0;
        
        // Background elements
        this.bgElements = {
            groundPattern: null,
            skyColor: '#4EC0CA',
            groundColor: '#DED895',
            pipeColors: {
                top: '#74BF2E',
                bottom: '#74BF2E',
                border: '#558022',
                highlight: '#98DE5B'
            }
        };
        
        // Load images
        this.images = {};
        this.loadImages();
        
        // Enhanced touch handling for Android
        this.touchStartY = 0;
        this.touchStartX = 0;
        this.touchThreshold = 10; // Reduced threshold for better response
        this.lastTouchTime = 0;
        this.touchCooldown = 100; // Reduced cooldown for more responsive feel
        this.isAndroid = /Android/i.test(navigator.userAgent);
        
        // Adjust settings for Android
        if (this.isAndroid) {
            this.settings.scrollSpeed *= 0.9; // Slightly slower for better control
            this.settings.pipeGap *= 1.1; // Slightly wider gaps
            this.bird.gravity *= 0.95; // Slightly lower gravity
            this.bird.jumpForce *= 0.95; // Slightly weaker jump
        }
        
        // Input handling
        this.setupEventListeners();
        
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
    
    setupEventListeners() {
        // Keyboard controls (for testing on desktop)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.handleInput();
            }
        });

        // Enhanced touch handling
        const handleTouch = (e) => {
            e.preventDefault();
            
            if (e.type === 'touchstart') {
                const touch = e.touches[0];
                this.touchStartX = touch.clientX;
                this.touchStartY = touch.clientY;
                
                // Check touch cooldown
                const now = Date.now();
                if (now - this.lastTouchTime >= this.touchCooldown) {
                    this.handleInput();
                    this.lastTouchTime = now;
                }
            } else if (e.type === 'touchmove') {
                if (e.touches.length > 0) {
                    const touch = e.touches[0];
                    const deltaX = touch.clientX - this.touchStartX;
                    const deltaY = touch.clientY - this.touchStartY;
                    
                    // If user is scrolling more than tapping, don't jump
                    if (Math.abs(deltaY) > this.touchThreshold * 2 || 
                        Math.abs(deltaX) > this.touchThreshold * 2) {
                        this.touchStartX = touch.clientX;
                        this.touchStartY = touch.clientY;
                    }
                }
            }
        };

        // Add touch event listeners with passive: false for Android
        this.canvas.addEventListener('touchstart', handleTouch, { passive: false });
        this.canvas.addEventListener('touchmove', handleTouch, { passive: false });
        this.canvas.addEventListener('touchend', (e) => e.preventDefault(), { passive: false });
        this.canvas.addEventListener('touchcancel', (e) => e.preventDefault(), { passive: false });
        
        // Prevent double-tap zoom on Android
        let lastTap = 0;
        document.addEventListener('touchend', (e) => {
            const currentTime = new Date().getTime();
            const tapLength = currentTime - lastTap;
            if (tapLength < 500 && tapLength > 0) {
                e.preventDefault();
            }
            lastTap = currentTime;
        });

        // Handle Android back button
        window.addEventListener('popstate', (e) => {
            e.preventDefault();
            if (this.gameState === 'playing') {
                this.gameOver();
            }
            history.pushState(null, null, window.location.href);
        });

        // Prevent pull-to-refresh on Android Chrome
        document.body.addEventListener('touchmove', (e) => {
            if (this.gameState === 'playing') {
                e.preventDefault();
            }
        }, { passive: false });
        
        // Handle visibility change (app switching on Android)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.gameState === 'playing') {
                this.pauseGame();
            } else if (!document.hidden && this.gameState === 'paused') {
                this.resumeGame();
            }
        });
    }

    handleInput() {
        // Add vibration feedback for Android
        if (this.isAndroid && window.navigator.vibrate) {
            window.navigator.vibrate(10); // Short vibration feedback
        }

        if (this.gameState === 'start') {
            this.startGame();
        } else if (this.gameState === 'playing') {
            this.birdJump();
        } else if (this.gameState === 'gameOver') {
            this.startGame();
        }
    }
    
    resizeCanvas() {
        const container = this.canvas.parentElement;
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        
        // Maintain aspect ratio
        const gameAspectRatio = 400 / 600;
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
        this.canvas.width = 400;
        this.canvas.height = 600;
    }

    pauseGame() {
        if (this.gameState === 'playing') {
            // Store current state if needed
            this.gameState = 'paused';
        }
    }
    
    startGame() {
        this.gameState = 'playing';
        this.score = 0;
        this.bird.y = 300;
        this.bird.velocity = 0;
        this.pipes = [];
        this.lastPipeSpawn = 0;
        this.hasStartedPlaying = false;
        
        this.startScreen.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');
        this.gameScreen.classList.remove('hidden');
        this.updateScore();
    }
    
    resetGame() {
        this.gameState = 'start';
        this.startScreen.classList.remove('hidden');
        this.gameOverScreen.classList.add('hidden');
    }
    
    birdJump() {
        if (this.gameState === 'playing') {
            if (!this.hasStartedPlaying) {
                this.hasStartedPlaying = true;
                this.lastPipeSpawn = 0;
            }
            this.bird.velocity = this.bird.jumpForce;
        }
    }
    
    updateBird(deltaTime) {
        if (this.gameState !== 'playing') return;

        if (!this.hasStartedPlaying) {
            // Hover animation before first interaction
            this.bird.y = 300 + Math.sin(Date.now() / 400) * 8;
            return;
        }

        // Normal physics after first interaction
        this.bird.velocity += this.bird.gravity;
        this.bird.y += this.bird.velocity;
        
        // Update rotation
        if (this.bird.velocity > 0) {
            this.bird.rotation += 2;
            if (this.bird.rotation > 90) this.bird.rotation = 90;
        }
        
        // Check bounds
        if (this.bird.y < 0) {
            this.bird.y = 0;
            this.bird.velocity = 0;
        }
        
        if (this.bird.y + this.bird.height > this.canvas.height - this.settings.groundHeight) {
            this.gameOver();
        }
    }
    
    spawnPipe() {
        const minHeight = 50;
        const maxHeight = this.canvas.height - this.settings.groundHeight - this.settings.pipeGap - minHeight;
        const height = Math.random() * (maxHeight - minHeight) + minHeight;
        
        this.pipes.push({
            x: this.canvas.width,
            topHeight: height,
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
        this.gameState = 'gameOver';
        this.gameScreen.classList.add('hidden');
        this.gameOverScreen.classList.remove('hidden');
        
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
        this.highScoreElement.textContent = this.highScore;
    }
    
    update(deltaTime) {
        if (this.gameState !== 'playing') return;
        
        this.updateBird(deltaTime);
        this.updatePipes(deltaTime);
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw sky with gradient
        const gradient = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        gradient.addColorStop(0, '#4EC0CA');
        gradient.addColorStop(1, '#7DD5DE');
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw clouds (simple pixel art style)
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.drawCloud(100 + Math.sin(Date.now() / 1000) * 30, 100);
        this.drawCloud(300 + Math.cos(Date.now() / 1000) * 30, 180);
        
        // Draw pipes
        this.pipes.forEach(pipe => {
            this.drawPipe(pipe.x, 0, pipe.topHeight, true);
            this.drawPipe(pipe.x, pipe.topHeight + this.settings.pipeGap, 
                         this.canvas.height - (pipe.topHeight + this.settings.pipeGap), false);
        });
        
        // Draw ground
        this.drawGround();
        
        // Draw bird
        this.drawBird();
    }

    drawCloud(x, y) {
        // Simple pixel art cloud
        this.ctx.fillRect(x, y, 30, 20);
        this.ctx.fillRect(x - 10, y + 10, 50, 10);
    }
    
    drawPipe(x, y, height, isTop) {
        const width = this.settings.pipeWidth;
        const capHeight = 32;
        
        this.ctx.fillStyle = this.bgElements.pipeColors.top;
        
        // Main pipe body
        this.ctx.fillStyle = this.bgElements.pipeColors.top;
        this.ctx.fillRect(x, y, width, height);
        
        // Pipe border
        this.ctx.fillStyle = this.bgElements.pipeColors.border;
        this.ctx.fillRect(x, isTop ? height - capHeight : y, width, capHeight);
        
        // Pipe highlight
        this.ctx.fillStyle = this.bgElements.pipeColors.highlight;
        this.ctx.fillRect(x + 2, y, 4, height);
        
        // Pipe shadow
        this.ctx.fillStyle = this.bgElements.pipeColors.border;
        this.ctx.fillRect(x + width - 4, y, 4, height);
    }

    drawGround() {
        const groundY = this.canvas.height - this.settings.groundHeight;
        
        // Update ground position
        this.settings.groundX = (this.settings.groundX - this.settings.groundSpeed) % 24;
        
        // Draw ground pattern
        this.ctx.fillStyle = this.bgElements.groundColor;
        this.ctx.fillRect(0, groundY, this.canvas.width, this.settings.groundHeight);
        
        // Draw ground pattern
        this.ctx.fillStyle = '#D2B463';
        for (let x = this.settings.groundX; x < this.canvas.width; x += 24) {
            this.ctx.fillRect(x, groundY, 12, 12);
            this.ctx.fillRect(x + 12, groundY + 12, 12, 12);
        }
    }

    drawBird() {
        // Update bird animation frame
        if (this.gameState === 'playing') {
            this.bird.frame = (this.frameCount % 15) < 8 ? 0 : 1;
        }
        
        this.ctx.save();
        this.ctx.translate(
            this.bird.x + this.bird.width / 2,
            this.bird.y + this.bird.height / 2
        );
        
        // Rotate bird based on velocity
        let rotation = this.bird.velocity * 2;
        rotation = Math.max(-20, Math.min(rotation, 90));
        this.ctx.rotate(rotation * Math.PI / 180);
        
        // Draw bird body
        this.ctx.fillStyle = '#FFD70D';
        this.ctx.fillRect(
            -this.bird.width / 2,
            -this.bird.height / 2,
            this.bird.width,
            this.bird.height
        );
        
        // Draw wing
        this.ctx.fillStyle = '#FFFFFF';
        const wingHeight = this.bird.frame === 0 ? 8 : 12;
        this.ctx.fillRect(
            -this.bird.width / 4,
            0,
            this.bird.width / 2,
            wingHeight
        );
        
        // Draw eye
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(
            this.bird.width / 4,
            -this.bird.height / 4,
            4,
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
