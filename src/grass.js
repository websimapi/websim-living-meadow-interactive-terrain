import * as THREE from 'three';
import { Perlin } from './utils.js';

const GRASS_VERTEX_SHADER = `
    precision highp float;
    
    uniform float uTime;
    uniform vec4 uInteractors[20]; // xyz, w=radius
    uniform vec4 uInteractorVelocities[20]; // xyz=vel, w=strength
    uniform vec3 uCameraPosition;
    
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
        
        // --- LOD/Distance Culling ---
        float dist = distance(offset, uCameraPosition);
        
        // Aggressive VR Culling: Fade out between 6m and 10m for extreme performance
        float distScale = 1.0 - smoothstep(6.0, 10.0, dist);
        
        if(distScale < 0.01) {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0); 
            return;
        }

        // --- 1. Base Geometry ---
        vec3 pos = position;
        float currentScale = scale * distScale;
        
        pos.y *= currentScale;
        pos.xz *= currentScale; 

        // Rotation
        float c = cos(rotation);
        float s = sin(rotation);
        mat2 rotateY = mat2(c, -s, s, c);
        pos.xz = rotateY * pos.xz;
        
        // Normal Rotation
        vec3 n = normal;
        n.xz = rotateY * n.xz;
        vNormal = normalize(n);

        // --- 2. Wind (World Space Logic) ---
        vec3 worldBasePos = offset;
        float t = uTime;
        float wind = sin(t * 0.5 + worldBasePos.x * 0.05 + worldBasePos.z * 0.05) * 0.5 +
                     sin(t * 1.5 + worldBasePos.x * 0.1 + worldBasePos.z * 0.2) * 0.2;
        
        float windBend = uv.y * uv.y;
        pos.x += wind * windBend * 0.5;
        pos.z += wind * windBend * 0.2;

        // --- 3. Stick Physics & Bending (Global Blade Interaction) ---
        // We interact with the "Stalk" root to ensure the whole blade responds together
        // preventing independent vertex distortion ("dents").
        
        vec3 worldPos = pos + offset;
        vec3 totalPush = vec3(0.0);
        
        for(int i=0; i<20; i++) {
            vec4 interactor = uInteractors[i];
            float radius = interactor.w;
            
            if(radius > 0.0) {
                vec3 intPos = interactor.xyz;
                vec3 intVel = uInteractorVelocities[i].xyz;
                
                // 1. Distance check XZ (Cylinder around grass root)
                vec2 dirXZ = worldBasePos.xz - intPos.xz;
                float d = length(dirXZ);
                
                // Interaction Radius: Tighter for precision
                float influenceRad = radius + 0.08; 
                
                // 2. Height check (Roughly within grass height range)
                float relY = intPos.y - worldBasePos.y;
                bool withinHeight = relY > -0.3 && relY < 1.0; 

                if (d < influenceRad && withinHeight) {
                    float power = 1.0 - (d / influenceRad);
                    power = power * power * power; // Cubic falloff for sharper "touch" near finger
                    
                    vec2 pushDir = normalize(dirXZ);
                    if (length(dirXZ) < 0.0001) pushDir = vec2(1.0, 0.0);
                    
                    // Velocity Drag (follow the finger motion)
                    totalPush.xz += intVel.xz * power * 0.2;
                    
                    // Repulsion (Push away from finger center)
                    // Reduced strength to keep grass closer to finger
                    totalPush.xz += pushDir * power * 0.5;
                }
            }
        }
        
        // Clamp force to prevent exploding geometry
        float pushLen = length(totalPush);
        if(pushLen > 1.5) totalPush = normalize(totalPush) * 1.5;

        // Apply Bending: Curve based on height squared
        // This ensures the top moves significantly more than the bottom ("Bends from top down")
        float bendFactor = uv.y * uv.y; 
        vec3 finalDisp = totalPush * bendFactor;
        
        worldPos += finalDisp;
        
        // Length Preservation (Arc approximation)
        // As it bends outward (XZ), lower the Y to simulate constant length
        float dispMag = length(finalDisp.xz);
        worldPos.y -= dispMag * 0.6 * uv.y; 
        
        // Prevent going below terrain
        if(worldPos.y < offset.y) worldPos.y = offset.y;

        // --- Output ---
        vWorldPosition = worldPos;
        vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        vViewPosition = -mvPosition.xyz;
    }
`;

const GRASS_DEPTH_VERTEX_SHADER = `
    precision highp float;
    
    uniform float uTime;
    uniform vec4 uInteractors[20];
    uniform vec4 uInteractorVelocities[20];
    uniform vec3 uCameraPosition;
    
    attribute vec2 uv;
    attribute vec3 offset;
    attribute float scale;
    attribute float rotation;
    
    void main() {
        float dist = distance(offset, uCameraPosition);
        float distScale = 1.0 - smoothstep(6.0, 10.0, dist);
        
        if(distScale < 0.01) {
            gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
            return;
        }

        vec3 pos = position;
        float currentScale = scale * distScale;
        
        pos.y *= currentScale;
        pos.xz *= currentScale;

        float c = cos(rotation);
        float s = sin(rotation);
        mat2 rotateY = mat2(c, -s, s, c);
        pos.xz = rotateY * pos.xz;
        
        vec3 worldBasePos = offset;
        float wind = sin(uTime * 0.5 + worldBasePos.x * 0.05 + worldBasePos.z * 0.05) * 0.5 +
                     sin(uTime * 1.5 + worldBasePos.x * 0.1 + worldBasePos.z * 0.2) * 0.2;
        
        float windBend = uv.y * uv.y;
        pos.x += wind * windBend * 0.5;
        pos.z += wind * windBend * 0.2;

        vec3 worldPos = pos + offset;
        vec3 totalPush = vec3(0.0);
        
        for(int i=0; i<20; i++) {
            vec4 interactor = uInteractors[i];
            float radius = interactor.w;
            if(radius > 0.0) {
                vec3 intPos = interactor.xyz;
                vec3 intVel = uInteractorVelocities[i].xyz;
                
                vec2 dirXZ = worldBasePos.xz - intPos.xz;
                float d = length(dirXZ);
                float influenceRad = radius + 0.08; 
                float relY = intPos.y - worldBasePos.y;

                if (d < influenceRad && relY > -0.3 && relY < 1.0) {
                    float power = 1.0 - (d / influenceRad);
                    power = power * power * power; 
                    
                    vec2 pushDir = normalize(dirXZ);
                    if (length(dirXZ) < 0.0001) pushDir = vec2(1.0, 0.0);
                    
                    totalPush.xz += intVel.xz * power * 0.2;
                    totalPush.xz += pushDir * power * 0.5;
                }
            }
        }
        
        float pushLen = length(totalPush);
        if(pushLen > 1.5) totalPush = normalize(totalPush) * 1.5;

        float bendFactor = uv.y * uv.y; 
        vec3 finalDisp = totalPush * bendFactor;
        
        worldPos += finalDisp;
        float dispMag = length(finalDisp.xz);
        worldPos.y -= dispMag * 0.6 * uv.y; 
        if(worldPos.y < offset.y) worldPos.y = offset.y;
        
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
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
        vec3 ambient = vec3(0.25, 0.35, 0.25); // Slightly brighter/greener ambient

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
            uInteractors: { value: new Float32Array(80) }, // 20 interactors * 4 floats
            uInteractorVelocities: { value: new Float32Array(80) }, // 20 * 4
        };
        
        // Chunk config
        this.chunkSize = 5; // Smaller chunks for very tight culling in VR
        this.terrainSize = 100;
        this.maxRenderDist = 10.0; // Highly optimized for mobile VR
    }

    init() {
        // --- Improved Blade Geometry ---
        // Optimized Geometry for VR (Significant vertex reduction)
        const bladeW = 0.12; 
        const bladeH = 0.8; 
        // Reduced segments: 2 width (3 verts), 4 height (5 verts) -> ~15 verts vs ~48
        const baseGeometry = new THREE.PlaneGeometry(bladeW, bladeH, 2, 4);
        
        // Modify shape
        const posAttr = baseGeometry.attributes.position;
        
        for(let i=0; i < posAttr.count; i++) {
            let x = posAttr.getX(i);
            let y = posAttr.getY(i);
            let z = posAttr.getZ(i);
            
            // Normalize Y 0..1
            y += bladeH / 2;
            
            // Taper width at top
            const normalizedY = y / bladeH;
            
            // Taper logic (Javascript)
            let widthFactor = 1.0 - Math.pow(normalizedY, 2.0) * 0.8;
            if(normalizedY > 0.9) widthFactor *= 0.5; // Sharp tip
            
            x *= widthFactor;
            
            // Cupping
            const xNorm = x / (bladeW * 0.5); 
            const cup = Math.pow(Math.abs(xNorm), 2.0) * 0.05 * (1.0 - normalizedY * 0.5); 
            z += cup; 
            
            // Curve blade
            z += Math.pow(normalizedY, 2.0) * 0.15;

            posAttr.setXYZ(i, x, y, z);
        }
        baseGeometry.computeVertexNormals();

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
                
                // Clone geometry per chunk to allow unique attributes
                const chunkGeo = baseGeometry.clone();
                const mesh = new THREE.InstancedMesh(chunkGeo, material, countPerChunk);
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
                
                chunkGeo.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
                chunkGeo.setAttribute('scale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 1));
                chunkGeo.setAttribute('rotation', new THREE.InstancedBufferAttribute(new Float32Array(rotations), 1));
                chunkGeo.setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
                
                // Calculate accurate bounding sphere for Frustum Culling
                let minY = Infinity;
                let maxY = -Infinity;
                for(let i=0; i<offsets.length; i+=3) {
                    const yVal = offsets[i+1];
                    if(yVal < minY) minY = yVal;
                    if(yVal > maxY) maxY = yVal;
                }
                const midY = (minY + maxY) / 2;
                const height = maxY - minY;
                
                // Center matches chunk center + terrain height average
                const center = new THREE.Vector3(x + this.chunkSize/2, midY, z + this.chunkSize/2);
                
                // Radius covers corners + max height deviation + grass height
                const radius = (this.chunkSize * 0.71) + (height / 2) + 1.0; 
                
                chunkGeo.boundingSphere = new THREE.Sphere(center, radius);

                // Metadata for CPU culling
                mesh.userData = {
                    center: center,
                    active: true
                };

                this.scene.add(mesh);
                this.meshes.push(mesh);
            }
        }
    }

    update(dt, interactionData, sunPos, cameraPos) {
        this.uniforms.uTime.value += dt;
        
        if (sunPos) this.uniforms.uSunPosition.value.copy(sunPos);
        if (cameraPos) this.uniforms.uCameraPosition.value.copy(cameraPos);

        // --- CPU Culling ---
        // Only render chunks near the camera to allow HIGH density without lag
        if (cameraPos) {
            const cullDistSq = this.maxRenderDist * this.maxRenderDist;
            for(let i = 0; i < this.meshes.length; i++) {
                const mesh = this.meshes[i];
                const center = mesh.userData.center;
                const distSq = center.distanceToSquared(cameraPos);
                
                const visible = distSq < cullDistSq;
                
                if (mesh.visible !== visible) {
                    mesh.visible = visible;
                }
            }
        }

        // --- Interaction Update ---
        if (interactionData && interactionData.posData) {
            this.uniforms.uInteractors.value.set(interactionData.posData);
            this.uniforms.uInteractorVelocities.value.set(interactionData.velData);
        }
    }
}

