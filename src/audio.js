export class AudioSystem {
    constructor(camera) {
        this.camera = camera;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.isInit = false;
        
        // Nodes
        this.windGain = null;
    }

    async init() {
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
        
        if (this.isInit) return;
        this.isInit = true;

        // Generate Pink Noise for Wind
        const bufferSize = 2 * this.ctx.sampleRate;
        const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        
        // Proper Pink Noise generation
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
            output[i] *= 0.11; // Normalize roughly to -1..1
            b6 = white * 0.115926;
        }

        const noiseSrc = this.ctx.createBufferSource();
        noiseSrc.buffer = noiseBuffer;
        noiseSrc.loop = true;

        // Filter to make it sound like wind
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        this.windGain = this.ctx.createGain();
        this.windGain.gain.value = 0.1;

        noiseSrc.connect(filter);
        filter.connect(this.windGain);
        this.windGain.connect(this.ctx.destination);
        
        noiseSrc.start(0);
        
        // Modulate wind volume/filter over time
        setInterval(() => {
            const time = Date.now() / 1000;
            const intensity = (Math.sin(time * 0.5) + 1) * 0.5; // 0 to 1
            
            filter.frequency.linearRampToValueAtTime(300 + intensity * 400, this.ctx.currentTime + 1);
            this.windGain.gain.linearRampToValueAtTime(0.05 + intensity * 0.1, this.ctx.currentTime + 1);
        }, 1000);
    }
}

