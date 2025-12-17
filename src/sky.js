import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export class SkySystem {
    constructor(scene, renderer) {
        this.scene = scene;
        this.renderer = renderer;
        this.sun = new THREE.Vector3();
        this.sky = new Sky();
        this.sky.scale.setScalar(450000);
        this.scene.add(this.sky);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 1);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.width = 2048;
        this.dirLight.shadow.mapSize.height = 2048;
        const d = 50;
        this.dirLight.shadow.camera.left = -d;
        this.dirLight.shadow.camera.right = d;
        this.dirLight.shadow.camera.top = d;
        this.dirLight.shadow.camera.bottom = -d;
        this.dirLight.shadow.camera.far = 100;
        this.dirLight.shadow.bias = -0.0001;
        this.scene.add(this.dirLight);

        this.ambientLight = new THREE.AmbientLight(0x222222);
        this.scene.add(this.ambientLight);

        // Sky parameters
        this.effectController = {
            turbidity: 10,
            rayleigh: 3,
            mieCoefficient: 0.005,
            mieDirectionalG: 0.7,
            elevation: 2,
            azimuth: 180,
            exposure: renderer.toneMappingExposure
        };

        this.updateSky();
        
        this.time = 450; // Start at ~7:30 AM equivalent
    }

    updateSky() {
        const uniforms = this.sky.material.uniforms;
        uniforms['turbidity'].value = this.effectController.turbidity;
        uniforms['rayleigh'].value = this.effectController.rayleigh;
        uniforms['mieCoefficient'].value = this.effectController.mieCoefficient;
        uniforms['mieDirectionalG'].value = this.effectController.mieDirectionalG;

        const phi = THREE.MathUtils.degToRad(90 - this.effectController.elevation);
        const theta = THREE.MathUtils.degToRad(this.effectController.azimuth);

        this.sun.setFromSphericalCoords(1, phi, theta);

        uniforms['sunPosition'].value.copy(this.sun);
        this.dirLight.position.copy(this.sun).multiplyScalar(50);
        
        // Adjust light intensity/color based on elevation
        const elevation = this.effectController.elevation;
        
        if (elevation > 0) {
            // Brighten up the day
            const intensityFactor = Math.min(1.0, elevation / 45.0);
            this.dirLight.intensity = intensityFactor * 2.5;
            this.ambientLight.intensity = 0.3 + (intensityFactor * 0.7);
            
            // Sunrise/Sunset colors
            if (elevation < 10) {
                this.dirLight.color.setHSL(0.08, 0.9, 0.6); // Golden/Orange
            } else {
                this.dirLight.color.setHSL(0.1, 0.1, 1.0); // White
            }
        } else {
            this.dirLight.intensity = 0;
            this.ambientLight.intensity = 0.15; // Brighter Night (moonlight)
        }
    }

    update(dt) {
        // Day/Night Cycle - 24 minutes = 1440 seconds
        this.time += dt;
        const cycleDuration = 1440; 
        const cycleProgress = (this.time % cycleDuration) / cycleDuration; // 0.0 to 1.0

        // Azimuth: Full 360 rotation
        this.effectController.azimuth = (cycleProgress * 360) - 180;
        
        // Elevation: Sine wave peaking at noon (progress 0.5)
        // Range: -20 to 80 degrees roughly
        this.effectController.elevation = Math.sin((cycleProgress - 0.25) * Math.PI * 2) * 50 + 30; 
        
        this.updateSky();
    }
}

