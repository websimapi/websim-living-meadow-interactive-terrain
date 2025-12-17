import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { Terrain } from './terrain.js';
import { GrassSystem } from './grass.js';
import { SkySystem } from './sky.js';
import { InteractionSystem } from './interaction.js';
import { AudioSystem } from './audio.js';

class App {
    constructor() {
        this.container = document.getElementById('canvas-container');
        
        // Scene setup
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.02);

        // Camera
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
        this.camera.position.set(0, 1.7, 5); // Eye level

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.xr.enabled = true;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.5;
        this.container.appendChild(this.renderer.domElement);
        this.container.appendChild(VRButton.createButton(this.renderer));

        // Subsystems
        this.terrain = new Terrain(this.scene);
        this.terrainMesh = this.terrain.init();

        this.grass = new GrassSystem(this.scene, this.terrain, 60000); // 60k blades
        this.grass.init();

        this.skySystem = new SkySystem(this.scene, this.renderer);
        this.interaction = new InteractionSystem(this.renderer, this.scene);
        this.audio = new AudioSystem(this.camera);

        // Events
        window.addEventListener('resize', this.onResize.bind(this));
        
        // Start Sound on user interaction (if not VR)
        window.addEventListener('click', () => this.audio.init(), { once: true });
        this.renderer.xr.addEventListener('sessionstart', () => this.audio.init());

        // Clock
        this.clock = new THREE.Clock();

        // Loop
        this.renderer.setAnimationLoop(this.render.bind(this));
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        const dt = this.clock.getDelta();

        // Update Systems
        this.skySystem.update(dt);
        
        const handPoints = this.interaction.update();
        this.grass.update(dt, handPoints);

        // Sync fog with sky
        this.scene.fog.color.copy(this.scene.background); // Approximation: better done via sky
        
        // For non-VR testing: slight camera movement
        if (!this.renderer.xr.isPresenting) {
            // Mouse look logic or WASD could go here, but focusing on VR view logic
        }

        this.renderer.render(this.scene, this.camera);
    }
}

new App();

