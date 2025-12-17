import * as THREE from 'three';
import { Perlin } from './utils.js';

const GRASS_VERTEX_SHADER = `
    precision highp float;
    
    uniform float uTime;
    uniform vec3 uInteractors[10];
    
    attribute vec3 offset;
    attribute float scale;
    attribute float rotation;
    attribute vec3 color;

    varying vec2 vUv;
    varying vec3 vColor;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;

    void main() {
        vUv = uv;
        vColor = color;
        
        // --- Geometry Transformation ---
        vec3 pos = position;
        
        // Scale
        pos.y *= scale;
        pos.xz *= scale * 0.8; // Maintain width

        // Rotation
        float c = cos(rotation);
        float s = sin(rotation);
        mat2 rotateY = mat2(c, -s, s, c);
        pos.xz = rotateY * pos.xz;
        
        // Normal Rotation
        vec3 n = normal;
        n.xz = rotateY * n.xz;
        vNormal = normalize(n);

        // --- Wind & Interaction ---
        vec3 worldBasePos = offset;
        
        // Wind Noise
        float windFreq = 1.0;
        float windAmp = 0.5;
        // Simple distinct wind patterns
        float wind = sin(uTime * 0.7 + worldBasePos.x * 0.1 + worldBasePos.z * 0.1) 
                   + cos(uTime * 1.2 + worldBasePos.x * 0.3);
        wind *= windAmp;

        float bend = uv.y * uv.y;
        
        // Apply Wind
        pos.x += wind * bend * 0.3;
        pos.z += wind * bend * 0.1;

        // --- High Precision Interaction ---
        vec3 globalPos = pos + worldBasePos;
        for(int i=0; i<10; i++) {
            vec3 interactor = uInteractors[i];
            
            // Fast check: is interactor active (not 0,0,0) and nearby
            // Increase check distance slightly to ensure smooth entry
            float checkRadius = 1.0; 
            
            if(dot(interactor, interactor) > 0.01) {
                vec3 diff = globalPos - interactor;
                float distSq = dot(diff, diff);
                
                if(distSq < (checkRadius * checkRadius)) {
                    float dist = sqrt(distSq);
                    
                    // Precise Interaction Radius
                    float radius = 0.5;
                    if(dist < radius) {
                        float force = (1.0 - dist / radius);
                        force = force * force; // Smooth quadratic falloff

                        // Push horizontally away from center of interactor
                        vec3 pushDir = normalize(vec3(diff.x, 0.0, diff.z));
                        
                        // Push Downward
                        float pushDown = -0.6 * force;
                        
                        // Apply
                        pos += pushDir * force * 1.0 * bend;
                        pos.y += pushDown * bend;
                    }
                }
            }
        }
        
        // --- Output ---
        vec4 worldPosition = vec4(pos + offset, 1.0);
        vWorldPosition = worldPosition.xyz;
        vec4 mvPosition = viewMatrix * worldPosition;
        
        gl_Position = projectionMatrix * mvPosition;
        vViewPosition = -mvPosition.xyz;
    }
`;

const GRASS_DEPTH_VERTEX_SHADER = `
    precision highp float;
    
    uniform float uTime;
    uniform vec3 uInteractors[10];
    
    attribute vec3 offset;
    attribute float scale;
    attribute float rotation;
    
    void main() {
        vec3 pos = position;
        
        pos.y *= scale;
        pos.xz *= scale * 0.8;

        float c = cos(rotation);
        float s = sin(rotation);
        mat2 rotateY = mat2(c, -s, s, c);
        pos.xz = rotateY * pos.xz;
        
        vec3 worldBasePos = offset;
        
        float wind = sin(uTime * 0.7 + worldBasePos.x * 0.1 + worldBasePos.z * 0.1) 
                   + cos(uTime * 1.2 + worldBasePos.x * 0.3);
        wind *= 0.5;

        float bend = uv.y * uv.y;
        
        pos.x += wind * bend * 0.3;
        pos.z += wind * bend * 0.1;

        vec3 globalPos = pos + worldBasePos;
        for(int i=0; i<10; i++) {
            vec3 interactor = uInteractors[i];
            float radius = 0.5;
            float rSq = radius * radius;
            
            if(dot(interactor, interactor) > 0.01) {
                vec3 diff = globalPos - interactor;
                float distSq = dot(diff, diff);
                
                if(distSq < rSq) {
                    float dist = sqrt(distSq);
                    float force = (1.0 - dist / radius);
                    force = force * force;

                    vec3 pushDir = normalize(vec3(diff.x, 0.0, diff.z));
                    pos += pushDir * force * 1.0 * bend;
                    pos.y += -0.6 * force * bend;
                }
            }
        }
        
        vec4 worldPosition = vec4(pos + offset, 1.0);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
`;

const GRASS_FRAGMENT_SHADER = `
    precision highp float;
    
    uniform vec3 uBaseColor;
    uniform vec3 uTipColor;
    uniform vec3 uSunPosition;
    uniform vec3 uCameraPosition;
    
    varying vec2 vUv;
    varying vec3 vColor;
    varying vec3 vNormal;
    varying vec3 vViewPosition;
    varying vec3 vWorldPosition;

    void main() {
        // --- LOD / Culling REMOVED for chunks ---
        // We rely on frustum culling now.
        // float dist = distance(vWorldPosition, uCameraPosition);
        // if(dist > 75.0) discard; 

        // --- Coloring ---
        vec3 albedo = mix(uBaseColor, uTipColor, vUv.y);
        albedo = mix(albedo, vColor, 0.3);
        
        // AO at bottom
        albedo *= smoothstep(0.0, 0.25, vUv.y); 

        // --- Lighting ---
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(uSunPosition);
        vec3 viewDir = normalize(uCameraPosition - vWorldPosition);

        // Diffuse
        float diff = max(dot(normal, lightDir), 0.0);
        
        // Translucency 
        float translucency = max(dot(viewDir, -lightDir), 0.0);
        translucency = pow(translucency, 4.0) * 0.6 * vUv.y; 
        
        // Specular
        vec3 halfVec = normalize(lightDir + viewDir);
        float spec = max(dot(normal, halfVec), 0.0);
        spec = pow(spec, 32.0) * 0.2; 

        // Ambient
        vec3 ambient = vec3(0.2, 0.3, 0.2); // Slightly greener ambient

        vec3 lighting = ambient + (diff * vec3(1.0, 0.95, 0.8)) + (translucency * vec3(0.6, 0.8, 0.2)) + spec;
        
        vec3 finalColor = albedo * lighting;

        // --- Fog ---
        // Basic fog to blend with sky at distance
        float dist = distance(vWorldPosition, uCameraPosition);
        float fogFactor = smoothstep(50.0, 90.0, dist);
        vec3 fogColor = vec3(0.53, 0.81, 0.92); 
        finalColor = mix(finalColor, fogColor, fogFactor);

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

export class GrassSystem {
    constructor(scene, terrain, totalCount = 1000000) {
        this.scene = scene;
        this.terrain = terrain;
        this.totalCount = totalCount;
        this.meshes = [];
        this.uniforms = {
            uTime: { value: 0 },
            uBaseColor: { value: new THREE.Color(0x113305) }, 
            uTipColor: { value: new THREE.Color(0x99bb11) }, 
            uSunPosition: { value: new THREE.Vector3(10, 50, 10) },
            uCameraPosition: { value: new THREE.Vector3(0, 2, 0) },
            uInteractors: { value: new Float32Array(30) },
        };
        
        // Chunk config
        this.chunkSize = 10;
        this.terrainSize = 100;
    }

    init() {
        // --- Improved Blade Geometry ---
        // 2 segments width (3 verts) to allow "cupping" (curved cross-section)
        // 3 segments height for smooth bending
        const bladeW = 0.12;
        const bladeH = 0.8;
        const geometry = new THREE.PlaneGeometry(bladeW, bladeH, 2, 3);
        
        // Modify shape
        const posAttr = geometry.attributes.position;
        // Vertices order in PlaneGeo (wSeg=2, hSeg=3) -> 3 columns, 4 rows. Total 12 verts.
        // Columns: x = -w/2, 0, w/2.
        
        for(let i=0; i < posAttr.count; i++) {
            let x = posAttr.getX(i);
            let y = posAttr.getY(i);
            let z = posAttr.getZ(i);
            
            // Normalize Y 0..1 (geometry is centered at 0, so y is -h/2 to h/2 initially)
            // Shift y so base is 0
            y += bladeH / 2;
            
            // Taper width at top
            const taper = Math.max(0.1, 1.0 - Math.pow(y / bladeH, 1.5));
            x *= taper;
            
            // Curve cross-section (cupping)
            // If x is not 0 (edges), pull z back
            const xNorm = x / (bladeW * 0.5); // -1 to 1 roughly
            const cup = Math.abs(xNorm) * 0.05; // 5cm curve depth? No, 0.05 units
            z += cup * (y / bladeH); // Cup more at top? Or uniform? Uniform is fine.
            
            // Curve blade along length (slight natural bend)
            z += Math.pow(y / bladeH, 2.0) * 0.1;

            posAttr.setXYZ(i, x, y, z);
        }
        geometry.computeVertexNormals();

        // Material
        const material = new THREE.ShaderMaterial({
            vertexShader: GRASS_VERTEX_SHADER,
            fragmentShader: GRASS_FRAGMENT_SHADER,
            uniforms: this.uniforms,
            side: THREE.DoubleSide
        });
        
        const depthMaterial = new THREE.ShaderMaterial({
            vertexShader: GRASS_DEPTH_VERTEX_SHADER,
            fragmentShader: "void main() { }",
            uniforms: this.uniforms
        });

        // --- Grid Generation ---
        const halfSize = this.terrainSize / 2;
        // Calculate instances per chunk
        const totalArea = this.terrainSize * this.terrainSize;
        const chunkArea = this.chunkSize * this.chunkSize;
        const numChunks = totalArea / chunkArea;
        const countPerChunk = Math.floor(this.totalCount / numChunks);

        const dummy = new THREE.Object3D();

        for (let x = -halfSize; x < halfSize; x += this.chunkSize) {
            for (let z = -halfSize; z < halfSize; z += this.chunkSize) {
                
                const mesh = new THREE.InstancedMesh(geometry, material, countPerChunk);
                mesh.customDepthMaterial = depthMaterial;
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                
                // IMPORTANT: Enable Frustum Culling
                mesh.frustumCulled = true;

                const offsets = [];
                const scales = [];
                const rotations = [];
                const colors = [];

                for (let i = 0; i < countPerChunk; i++) {
                    // Random pos within chunk
                    const lx = Math.random() * this.chunkSize;
                    const lz = Math.random() * this.chunkSize;
                    
                    const wx = x + lx;
                    const wz = z + lz;
                    
                    const wy = this.terrain.getHeightAt(wx, wz);

                    offsets.push(wx, wy, wz); // World position for shader
                    
                    // Scale & Variation
                    const noise = Perlin.noise(wx * 0.15, 0, wz * 0.15);
                    let scale = 0.35 + Math.random() * 0.15; // Taller base
                    if (noise > 0.1) {
                        const t = Math.min(1.0, (noise - 0.1) * 2.0);
                        scale = 0.35 + t * (0.6 + Math.random() * 0.3);
                    }
                    scales.push(scale);
                    
                    rotations.push(Math.random() * Math.PI * 2);
                    
                    // Color
                    const hueVar = (Math.random() - 0.5) * 0.1;
                    const satVar = (Math.random() - 0.5) * 0.2;
                    const valVar = (Math.random() - 0.5) * 0.2;
                    const col = new THREE.Color().setHSL(0.25 + hueVar, 0.5 + satVar, 0.4 + valVar);
                    colors.push(col.r, col.g, col.b);
                    
                    mesh.setMatrixAt(i, dummy.matrix); // Identity, we use attributes
                }
                
                mesh.geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
                mesh.geometry.setAttribute('scale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 1));
                mesh.geometry.setAttribute('rotation', new THREE.InstancedBufferAttribute(new Float32Array(rotations), 1));
                mesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
                
                // Set Bounding Sphere for Culling
                // Center of chunk is x + 5, z + 5
                // Radius ~ 8 (diagonal of 5x5 is 7.07)
                // Use slightly larger radius to account for blade height and lean
                const center = new THREE.Vector3(x + this.chunkSize/2, 0, z + this.chunkSize/2);
                // We need Y center roughly. Average height? 
                // Terrain height varies. Let's use a large radius for Y safety or compute it.
                // For simplicity, sphere at y=0 with radius 15 covers 10x10 chunk + some height variation nicely
                mesh.geometry.boundingSphere = new THREE.Sphere(center, 12);

                this.scene.add(mesh);
                this.meshes.push(mesh);
            }
        }
    }

    update(dt, interactionPoints, sunPos, cameraPos) {
        this.uniforms.uTime.value += dt;
        
        if (sunPos) this.uniforms.uSunPosition.value.copy(sunPos);
        if (cameraPos) this.uniforms.uCameraPosition.value.copy(cameraPos);

        const arr = this.uniforms.uInteractors.value;
        arr.fill(0);
        let idx = 0;
        interactionPoints.forEach(pt => {
            if(idx < 30) {
                arr[idx++] = pt.x;
                arr[idx++] = pt.y;
                arr[idx++] = pt.z;
            }
        });
    }
}

