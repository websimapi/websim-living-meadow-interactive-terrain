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
        
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5; 
        }
        let lastOut = 0;

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
            
            filter.frequency.rampToValueAtTime(300 + intensity * 400, this.ctx.currentTime + 1);
            this.windGain.gain.rampToValueAtTime(0.05 + intensity * 0.1, this.ctx.currentTime + 1);
        }, 1000);
    }
}

