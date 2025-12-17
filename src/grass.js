import * as THREE from 'three';

const GRASS_VERTEX_SHADER = `
    precision highp float;
    
    // Uniforms
    uniform float uTime;
    uniform vec3 uInteractors[10]; // Up to 10 interaction points (fingers)
    uniform float uInteractorStrength;
    
    // Attributes
    attribute vec3 offset;
    attribute float scale;
    attribute float rotation;
    attribute vec3 color;

    // Varying
    varying vec2 vUv;
    varying vec3 vColor;
    varying float vLighting;
    varying vec3 vGlobalPosition;

    // Noise function
    float simpleNoise(vec2 st) {
        return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    void main() {
        vUv = uv;
        vColor = color;
        
        // Initial position
        vec3 pos = position;
        
        // Scale blade
        pos.y *= scale;
        pos.xz *= scale * 0.6; // Slightly thinner

        // Rotation around Y axis
        float c = cos(rotation);
        float s = sin(rotation);
        mat2 rotateY = mat2(c, -s, s, c);
        pos.xz = rotateY * pos.xz;

        // --- Wind Calculation ---
        vec3 worldPosition = offset;
        
        // Wind noise layers
        float windA = sin(uTime * 1.5 + worldPosition.x * 0.1 + worldPosition.z * 0.1);
        float windB = cos(uTime * 2.0 + worldPosition.x * 0.5 - worldPosition.z * 0.2);
        float windCombined = (windA + windB * 0.5) * 0.5; // -1 to 1

        // Apply wind bending based on UV.y (tip bends more)
        float windStrength = 0.5 * uv.y * uv.y; // Non-linear bend
        pos.x += windCombined * windStrength;
        pos.z += windCombined * windStrength * 0.5;
        
        // --- Interaction Physics (Bending away from hands) ---
        vec3 globalPos = pos + offset;
        vec3 displacement = vec3(0.0);
        
        for(int i = 0; i < 10; i++) {
            vec3 interactor = uInteractors[i];
            
            // If interactor is at (0,0,0) assume inactive
            if(length(interactor) < 0.1) continue;

            float dist = distance(globalPos, interactor);
            float radius = 0.8; // Interaction radius
            
            if(dist < radius) {
                vec3 dir = normalize(globalPos - interactor);
                float influence = (1.0 - dist / radius) * uv.y; // Affect tips more
                displacement += dir * influence * 2.0;
            }
        }
        
        pos += displacement;
        
        // Depression correction: ensure length is roughly preserved (fake spring)
        // If we push X/Z out, Y should go down slightly
        float len = length(pos);
        // pos = normalize(pos) * (position.y * scale); // Strict length constraint (expensive?)
        
        // Apply offset to world
        vec4 mvPosition = modelViewMatrix * vec4(pos + offset, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        // Fake Ambient Occlusion for base
        vLighting = 0.5 + 0.5 * uv.y; 
        
        vGlobalPosition = (modelMatrix * vec4(pos + offset, 1.0)).xyz;
    }
`;

const GRASS_FRAGMENT_SHADER = `
    precision highp float;
    
    uniform vec3 uBaseColor;
    uniform vec3 uTipColor;
    
    varying vec2 vUv;
    varying vec3 vColor;
    varying float vLighting;
    varying vec3 vGlobalPosition;

    void main() {
        // Gradient from base to tip
        vec3 finalColor = mix(uBaseColor, uTipColor, vUv.y);
        
        // Apply per-instance variation
        finalColor = mix(finalColor, vColor, 0.3);
        
        // Fake lighting/AO
        finalColor *= vLighting;
        
        // Simple Atmospheric Haze (Fog)
        float dist = length(vGlobalPosition.xz); // Distance from center approximately
        float fogFactor = smoothstep(30.0, 60.0, dist);
        
        // We output transparency for alpha testing to soften edges if needed, 
        // but here we are opaque mostly for perf.
        
        // Discard bottom for shape if using a square plane
        // But we use custom geometry, so no discard needed usually.
        // Simple shape shaping:
        if (vUv.x < 0.2 * vUv.y || vUv.x > 1.0 - (0.2 * vUv.y)) {
             // Tapering shape via discard if using quad
             // discard; 
        }

        gl_FragColor = vec4(finalColor, 1.0);
        
        // Apply simple fog blending manually if needed, or rely on three.js chunks
        #include <fog_fragment>
    }
`;

export class GrassSystem {
    constructor(scene, terrain, count = 100000) {
        this.scene = scene;
        this.terrain = terrain;
        this.count = count;
        this.mesh = null;
        this.uniforms = {
            uTime: { value: 0 },
            uBaseColor: { value: new THREE.Color(0x1a4b0a) }, 
            uTipColor: { value: new THREE.Color(0xaacc22) }, 
            uInteractors: { value: new Float32Array(30) }, // 10 vec3s
            uInteractorStrength: { value: 1.0 },
            fogColor: { value: scene.fog ? scene.fog.color : new THREE.Color(0x000000) },
            fogNear: { value: scene.fog ? scene.fog.near : 0 },
            fogFar: { value: scene.fog ? scene.fog.far : 100 }
        };
    }

    init() {
        // Create enhanced blade geometry
        // Using PlaneGeometry but modifying vertices for tapering and curve
        const BLADE_SEGS = 4;
        const bladeGeo = new THREE.PlaneGeometry(0.12, 1, 1, BLADE_SEGS);
        bladeGeo.translate(0, 0.5, 0); // Pivot at base

        // Taper and curve the blade
        const posAttribute = bladeGeo.attributes.position;
        
        for (let i = 0; i < posAttribute.count; i++) {
            const x = posAttribute.getX(i);
            const y = posAttribute.getY(i); // 0 to 1
            
            // Taper width towards the top
            const taper = Math.max(0, 1.0 - y); 
            // Square root makes the base wider and tip pointy (parabolic-ish shape)
            const shapeFactor = Math.pow(taper, 0.6); 
            
            posAttribute.setX(i, x * shapeFactor);
            
            // Static curve: lean the grass slightly forward
            // Z = y^2 * strength
            posAttribute.setZ(i, Math.pow(y, 1.5) * 0.15);
        }
        bladeGeo.computeVertexNormals();

        const material = new THREE.ShaderMaterial({
            vertexShader: GRASS_VERTEX_SHADER,
            fragmentShader: GRASS_FRAGMENT_SHADER,
            uniforms: THREE.UniformsUtils.merge([
                THREE.UniformsLib.fog,
                this.uniforms
            ]),
            side: THREE.DoubleSide,
            fog: true
        });

        this.mesh = new THREE.InstancedMesh(bladeGeo, material, this.count);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        const dummy = new THREE.Object3D();
        const offsets = [];
        const scales = [];
        const rotations = [];
        const colors = [];

        for (let i = 0; i < this.count; i++) {
            // Distribute grass in a circle
            const r = 45 * Math.sqrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;
            
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);
            const y = this.terrain.getHeightAt(x, z);

            offsets.push(x, y, z);
            scales.push(0.6 + Math.random() * 0.6); // Height variation
            rotations.push(Math.random() * Math.PI * 2); // Full rotation
            
            // Color variation: mix of fresh green and dryish yellow
            const hueVar = (Math.random() - 0.5) * 0.15;
            const satVar = (Math.random() - 0.5) * 0.2;
            const col = new THREE.Color().setHSL(0.25 + hueVar, 0.6 + satVar, 0.4 + Math.random() * 0.2);
            colors.push(col.r, col.g, col.b);
            
            dummy.position.set(0,0,0); 
            dummy.updateMatrix();
            this.mesh.setMatrixAt(i, dummy.matrix);
        }

        this.mesh.geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
        this.mesh.geometry.setAttribute('scale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 1));
        this.mesh.geometry.setAttribute('rotation', new THREE.InstancedBufferAttribute(new Float32Array(rotations), 1));
        this.mesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));

        this.scene.add(this.mesh);
    }

    update(dt, interactionPoints) {
        this.uniforms.uTime.value += dt;
        
        // Update interaction points (flattened vec3 array)
        const arr = this.uniforms.uInteractors.value;
        arr.fill(0); // Clear
        
        let idx = 0;
        interactionPoints.forEach(pt => {
            if(idx < 30) {
                arr[idx++] = pt.x;
                arr[idx++] = pt.y;
                arr[idx++] = pt.z;
            }
        });
        
        this.mesh.material.uniformsNeedUpdate = true;
    }
}

