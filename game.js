class FlappyBird {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        this.pipePattern = {
            type: "straight",
            counter: 0,
            direction: 1,
            waveAngle: 0
        };

        
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
            gravity: 0.5,         // Increased gravity
            jumpForce: -8,        // Stronger jump
            rotation: 0,
            flapSpeed: 0.15,
            frame: 0,
            frameCount: 3
        };
        
        // Game settings
        this.settings = {
            pipeGap: 120,          // Slightly smaller gap like original
            pipeWidth: 52,         // Original pipe width
            pipeSpawnInterval: 1500, // Faster pipe spawn
            scrollSpeed: 2.5,      // Slightly slower scroll for better control
            groundHeight: 112,
            groundSpeed: 2.5,      // Match scroll speed
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
        this.currentDifficulty = {
            gap: this.pipeSettings.baseGap,
            speed: this.pipeSettings.baseSpeed,
            heightVariance: 100     // Initial height variance
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

        // Set up event listeners for both mouse/touch and keyboard
        this.setupControls();

        // Start game loop
        this.lastTime = 0;
    }

    setupControls() {
        // Touch events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent scrolling
            this.handleInput();
        }, { passive: false });

        // Mouse events
        this.canvas.addEventListener('click', (e) => {
            e.preventDefault();
            this.handleInput();
        });

        // Keyboard events
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.handleInput();
            }
        });

        // Prevent default touch behaviors
        document.addEventListener('touchmove', (e) => {
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

    handleInput() {
        switch (this.gameState) {
            case 'start':
                this.startGame();
                this.birdJump();
                break;
            case 'playing':
                this.birdJump();
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
        const minH = this.pipeSettings.minHeight;
        const maxH = availableHeight - this.pipeSettings.minHeight;

        // --- Pattern switching ---
        if (this.pipePattern.counter <= 0) {
            const types = ["straight", "rise", "fall", "wave", "burst"];
            this.pipePattern.type = types[Math.floor(Math.random() * types.length)];
            this.pipePattern.counter = Math.floor(Math.random() * 3) + 2; // lasts 2–5 pipes
            this.pipePattern.waveAngle = 0;
        }

        let newHeight = this.pipeSettings.lastHeight;

        switch (this.pipePattern.type) {

            case "straight":
                // Keep almost same height
                newHeight += (Math.random() - 0.5) * 20;
                break;

            case "rise":
                newHeight += 20;  // move upward each pipe
                break;

            case "fall":
                newHeight -= 20;  // move downward each pipe
                break;

            case "wave":
                this.pipePattern.waveAngle += Math.PI / 6;
                newHeight += Math.sin(this.pipePattern.waveAngle) * 40;
                break;

            case "burst":
                // sudden high or low
                newHeight += (Math.random() > 0.5 ? 1 : -1) * (50 + Math.random() * 80);
                break;
        }

        this.pipePattern.counter--;

        // Clamp to limits
        newHeight = Math.max(minH, Math.min(maxH, newHeight));

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
        this.highScoreElement.textContent = this.highScore.toString().padStart(3, '0');
    }
    
    update(deltaTime) {
        if (this.gameState !== 'playing') return;

        this.updateBird(deltaTime);
        this.updatePipes(deltaTime);
        this.updateDifficulty();  // Add difficulty update
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
        
        // Main pipe body (green)
        this.ctx.fillStyle = '#74BF2E';
        this.ctx.fillRect(x, y, width, height);
        
        // Lighter highlight
        this.ctx.fillStyle = '#8FE236';
        this.ctx.fillRect(x + 2, y, width / 3, height);
        
        // Pipe cap
        this.ctx.fillStyle = '#74BF2E';
        if (isTop) {
            this.ctx.fillRect(x - 3, y + height - capHeight, width + 6, capHeight);
            // Cap highlight
            this.ctx.fillStyle = '#8FE236';
            this.ctx.fillRect(x - 1, y + height - capHeight, width / 3 + 2, capHeight);
        } else {
            this.ctx.fillRect(x - 3, y, width + 6, capHeight);
            // Cap highlight
            this.ctx.fillStyle = '#8FE236';
            this.ctx.fillRect(x - 1, y, width / 3 + 2, capHeight);
        }
    }

    drawGround() {
        // Draw scrolling ground
        this.ctx.fillStyle = '#DED895';
        this.ctx.fillRect(0, this.canvas.height - this.settings.groundHeight, 
                         this.canvas.width, this.settings.groundHeight);
        
        // Draw ground pattern
        this.ctx.fillStyle = '#D2691E';
        for (let i = 0; i < this.canvas.width + this.settings.groundSpeed; i += 20) {
            const x = (i - this.settings.groundX) % this.canvas.width;
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
        
        // Draw bird body (yellow)
        this.ctx.fillStyle = '#FFD70D';
        this.ctx.fillRect(
            -this.bird.width / 2,
            -this.bird.height / 2,
            this.bird.width,
            this.bird.height
        );
        
        // Draw wing (white)
        this.ctx.fillStyle = '#FFFFFF';
        const wingHeight = this.frameCount % 15 < 8 ? 8 : 12;
        this.ctx.fillRect(
            -this.bird.width / 4,
            0,
            this.bird.width / 2,
            wingHeight
        );
        
        // Draw eye (black)
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(
            this.bird.width / 4 - 2,
            -this.bird.height / 4,
            4,
            4
        );
        
        // Draw beak (orange)
        this.ctx.fillStyle = '#FFA500';
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
