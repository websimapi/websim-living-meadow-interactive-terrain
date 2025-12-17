import * as THREE from 'three';

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
        pos.xz *= scale * 0.7; // Width relative to height

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
        float wind = sin(uTime * windFreq + worldBasePos.x * 0.2 + worldBasePos.z * 0.2) 
                   + cos(uTime * 1.5 + worldBasePos.x * 0.5);
        wind *= windAmp;

        // Bending factor (stiff at bottom, bendy at top)
        float bend = uv.y * uv.y;
        
        // Apply Wind
        pos.x += wind * bend * 0.3;
        pos.z += wind * bend * 0.1;

        // Interaction
        vec3 globalPos = pos + worldBasePos;
        for(int i=0; i<10; i++) {
            vec3 interactor = uInteractors[i];
            float radius = 1.5;
            float rSq = radius * radius;
            
            // Fast check: is interactor active (not 0,0,0) and nearby
            if(dot(interactor, interactor) > 0.01) {
                vec3 diff = globalPos - interactor;
                float distSq = dot(diff, diff);
                
                if(distSq < rSq) {
                    float dist = sqrt(distSq);
                    vec3 dir = diff / dist;
                    dir.y = 0.1;
                    dir = normalize(dir);
                    
                    float inf = (1.0 - dist / radius);
                    inf = inf * inf; // Smooth falloff (avoid pow)
                    
                    pos += dir * inf * 2.5 * bend;
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
    
    // Instancing attributes
    attribute vec3 offset;
    attribute float scale;
    attribute float rotation;
    
    void main() {
        // --- Geometry Transformation ---
        vec3 pos = position;
        
        // Scale
        pos.y *= scale;
        pos.xz *= scale * 0.7;

        // Rotation
        float c = cos(rotation);
        float s = sin(rotation);
        mat2 rotateY = mat2(c, -s, s, c);
        pos.xz = rotateY * pos.xz;
        
        // --- Wind & Interaction ---
        vec3 worldBasePos = offset;
        
        // Wind Noise
        float windFreq = 1.0;
        float windAmp = 0.5;
        float wind = sin(uTime * windFreq + worldBasePos.x * 0.2 + worldBasePos.z * 0.2) 
                   + cos(uTime * 1.5 + worldBasePos.x * 0.5);
        wind *= windAmp;

        float bend = uv.y * uv.y;
        
        pos.x += wind * bend * 0.3;
        pos.z += wind * bend * 0.1;

        // Interaction
        vec3 globalPos = pos + worldBasePos;
        for(int i=0; i<10; i++) {
            vec3 interactor = uInteractors[i];
            float radius = 1.5;
            float rSq = radius * radius;
            
            if(dot(interactor, interactor) > 0.01) {
                vec3 diff = globalPos - interactor;
                float distSq = dot(diff, diff);
                
                if(distSq < rSq) {
                    float dist = sqrt(distSq);
                    vec3 dir = diff / dist;
                    dir.y = 0.1;
                    dir = normalize(dir);
                    
                    float inf = (1.0 - dist / radius);
                    inf = inf * inf;
                    
                    pos += dir * inf * 2.5 * bend;
                }
            }
        }
        
        // --- Output ---
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
        // --- LOD / Culling ---
        // Distance from camera
        float dist = distance(vWorldPosition, uCameraPosition);
        if(dist > 75.0) discard; // Hard cull far away

        // --- Coloring ---
        vec3 albedo = mix(uBaseColor, uTipColor, vUv.y);
        albedo = mix(albedo, vColor, 0.4); // Variation
        
        // Fake AO at bottom
        albedo *= smoothstep(0.0, 0.3, vUv.y); 

        // --- Lighting ---
        vec3 normal = normalize(vNormal);
        vec3 lightDir = normalize(uSunPosition);
        vec3 viewDir = normalize(uCameraPosition - vWorldPosition);

        // Diffuse
        float diff = max(dot(normal, lightDir), 0.0);
        
        // Translucency (Subsurface Scattering approximation for grass)
        float translucency = max(dot(viewDir, -lightDir), 0.0);
        translucency = pow(translucency, 8.0) * 0.8 * vUv.y; // Tips glow more
        
        // Specular
        vec3 halfVec = normalize(lightDir + viewDir);
        float spec = max(dot(normal, halfVec), 0.0);
        spec = pow(spec, 16.0) * 0.1; // Broad, soft highlight

        // Ambient
        vec3 ambient = vec3(0.15, 0.25, 0.15);

        vec3 lighting = ambient + (diff * vec3(1.0, 0.9, 0.7)) + (translucency * vec3(0.8, 0.9, 0.2)) + spec;
        
        vec3 finalColor = albedo * lighting;

        // --- Fog ---
        // Simple manual fog or use Three.js chunk if we used ShaderMaterial properly with chunks
        // Custom fog to match sky
        float fogFactor = smoothstep(40.0, 75.0, dist);
        vec3 fogColor = vec3(0.53, 0.81, 0.92); 
        finalColor = mix(finalColor, fogColor, fogFactor);

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

export class GrassSystem {
    constructor(scene, terrain, count = 250000) {
        this.scene = scene;
        this.terrain = terrain;
        this.count = count;
        this.mesh = null;
        this.uniforms = {
            uTime: { value: 0 },
            uBaseColor: { value: new THREE.Color(0x1a4b0a) }, 
            uTipColor: { value: new THREE.Color(0xaacc22) }, 
            uSunPosition: { value: new THREE.Vector3(10, 50, 10) },
            uCameraPosition: { value: new THREE.Vector3(0, 2, 0) },
            uInteractors: { value: new Float32Array(30) },
            uInteractorStrength: { value: 1.0 }
        };
    }

    init() {
        // Optimized blade geometry (fewer segments for higher count)
        const BLADE_SEGS = 3;
        const bladeGeo = new THREE.PlaneGeometry(0.1, 0.8, 1, BLADE_SEGS);
        bladeGeo.translate(0, 0.4, 0); 

        // Shape vertices for grass blade
        const posAttribute = bladeGeo.attributes.position;
        for (let i = 0; i < posAttribute.count; i++) {
            const x = posAttribute.getX(i);
            const y = posAttribute.getY(i); 
            // Parabolic taper
            const taper = Math.max(0, 1.0 - y); 
            const shape = Math.pow(taper, 0.8); 
            posAttribute.setX(i, x * shape);
            // Slight curve
            posAttribute.setZ(i, Math.pow(y, 2.0) * 0.2);
        }
        bladeGeo.computeVertexNormals();

        const material = new THREE.ShaderMaterial({
            vertexShader: GRASS_VERTEX_SHADER,
            fragmentShader: GRASS_FRAGMENT_SHADER,
            uniforms: this.uniforms,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.InstancedMesh(bladeGeo, material, this.count);
        
        // CRITICAL FIX: Update bounding sphere so frustum culling doesn't hide the grass
        this.mesh.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0,0,0), 100);
        this.mesh.frustumCulled = false; 

        this.mesh.receiveShadow = true;
        this.mesh.castShadow = true; 
        
        // Custom depth material for proper shadow casting with vertex displacement
        this.mesh.customDepthMaterial = new THREE.ShaderMaterial({
            vertexShader: GRASS_DEPTH_VERTEX_SHADER,
            fragmentShader: "void main() { }", // Simple depth write
            uniforms: this.uniforms
        });

        const dummy = new THREE.Object3D();
        const offsets = [];
        const scales = [];
        const rotations = [];
        const colors = [];

        for (let i = 0; i < this.count; i++) {
            // Circle distribution
            const r = 50 * Math.sqrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;
            
            const x = r * Math.cos(theta);
            const z = r * Math.sin(theta);
            const y = this.terrain.getHeightAt(x, z);

            offsets.push(x, y, z);
            scales.push(0.5 + Math.random() * 0.7); 
            rotations.push(Math.random() * Math.PI * 2); 
            
            // Color variation
            const hueVar = (Math.random() - 0.5) * 0.1;
            const satVar = (Math.random() - 0.5) * 0.2;
            const valVar = (Math.random() - 0.5) * 0.2;
            
            const col = new THREE.Color().setHSL(0.25 + hueVar, 0.5 + satVar, 0.4 + valVar);
            colors.push(col.r, col.g, col.b);
            
            // Dummy matrix (needed for InstancedMesh internal structure even if unused in shader)
            this.mesh.setMatrixAt(i, dummy.matrix);
        }

        this.mesh.geometry.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
        this.mesh.geometry.setAttribute('scale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 1));
        this.mesh.geometry.setAttribute('rotation', new THREE.InstancedBufferAttribute(new Float32Array(rotations), 1));
        this.mesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));

        this.scene.add(this.mesh);
    }

    update(dt, interactionPoints, sunPos, cameraPos) {
        this.uniforms.uTime.value += dt;
        
        if (sunPos) this.uniforms.uSunPosition.value.copy(sunPos);
        if (cameraPos) this.uniforms.uCameraPosition.value.copy(cameraPos);

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
        
        // this.mesh.material.uniformsNeedUpdate = true; // Not strictly needed for shader uniforms if value refs update
    }
}

