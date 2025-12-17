import * as THREE from 'three';
import { Perlin } from './utils.js';

export class Terrain {
    constructor(scene) {
        this.scene = scene;
        this.width = 100;
        this.depth = 100;
        this.resolution = 128;
        this.mesh = null;
    }

    init() {
        // High geometric complexity near center, progressive simplification handled by Geometry
        // We use a high segment plane for the ground
        const geometry = new THREE.PlaneGeometry(this.width, this.depth, this.resolution, this.resolution);
        geometry.rotateX(-Math.PI / 2);

        const vertices = geometry.attributes.position.array;

        // Generate heightmap with micro-variations
        for (let i = 0; i < vertices.length; i += 3) {
            const x = vertices[i];
            const z = vertices[i + 2];

            // Multiple octaves of noise for rolling hills and micro-details
            const elevation = 
                Perlin.noise(x * 0.03, 0, z * 0.03) * 3.0 +    // Rolling hills
                Perlin.noise(x * 0.1, 10, z * 0.1) * 0.5 +    // Medium details
                Perlin.noise(x * 0.5, 20, z * 0.5) * 0.1;     // Micro variations

            vertices[i + 1] = elevation;
        }

        geometry.computeVertexNormals();

        // Texture generation for ground
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        context.fillStyle = '#1a2b10'; // Dark soil/base grass
        context.fillRect(0,0,512,512);
        
        // Add noise to texture
        const imageData = context.getImageData(0,0,512,512);
        const data = imageData.data;
        for(let i=0; i < data.length; i+=4) {
            const noise = Math.random() * 20;
            data[i] += noise;
            data[i+1] += noise + 10;
            data[i+2] += noise;
        }
        context.putImageData(imageData, 0, 0);

        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(10, 10);

        const material = new THREE.MeshStandardMaterial({
            map: texture,
            roughness: 0.9,
            metalness: 0.0,
            color: 0x668866
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        return this.mesh;
    }

    getHeightAt(x, z) {
        // Helper to get terrain height at specific coordinates for placing grass
        // mirroring the noise function in init
         return Perlin.noise(x * 0.03, 0, z * 0.03) * 3.0 +    
                Perlin.noise(x * 0.1, 10, z * 0.1) * 0.5 +    
                Perlin.noise(x * 0.5, 20, z * 0.5) * 0.1; 
    }
}

