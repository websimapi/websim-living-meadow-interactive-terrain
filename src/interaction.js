import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

export class InteractionSystem {
    constructor(renderer, scene) {
        this.renderer = renderer;
        this.scene = scene;
        this.controllers = [];
        this.hands = [];
        this.interactionPoints = []; 
        
        // Map to store previous positions for velocity calculation
        // Key: unique string ID, Value: Vector3
        this.prevJointData = new Map();
        
        this.initXR();
    }

    initXR() {
        const controllerModelFactory = new XRControllerModelFactory();
        const handModelFactory = new XRHandModelFactory();

        // Setup controllers and hands
        for (let i = 0; i < 2; i++) {
            const controller = this.renderer.xr.getController(i);
            this.scene.add(controller);
            this.controllers.push(controller);

            const controllerGrip = this.renderer.xr.getControllerGrip(i);
            controllerGrip.add(controllerModelFactory.createControllerModel(controllerGrip));
            this.scene.add(controllerGrip);

            const hand = this.renderer.xr.getHand(i);
            hand.add(handModelFactory.createHandModel(hand));
            this.scene.add(hand);
            this.hands.push(hand);
        }
    }

    update(dt) {
        // Output arrays for Shader (max 50 interactors)
        const posData = new Float32Array(200); // 50 * 4
        const velData = new Float32Array(200); // 50 * 4
        let count = 0;

        // Expanded joint tracking for realistic stick physics
        // Tracks 12 points per hand to approximate full finger collision
        const jointsToTrack = [
            'index-finger-tip', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-proximal',
            'middle-finger-tip', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-proximal',
            'ring-finger-tip', 'ring-finger-phalanx-intermediate',
            'pinky-finger-tip', 'pinky-finger-phalanx-intermediate',
            'thumb-tip', 'thumb-phalanx-distal'
        ];

        // Helper to add interactor data
        const addInteractor = (id, pos, radius) => {
            if (count >= 50) return;

            let vel = new THREE.Vector3(0, 0, 0);
            
            // Calculate velocity if we have history
            if (this.prevJointData.has(id)) {
                const prev = this.prevJointData.get(id);
                if (dt > 0.0001) {
                    vel.subVectors(pos, prev).divideScalar(dt);
                }
            }
            
            // Update history
            this.prevJointData.set(id, pos.clone());

            // Fill Arrays
            const idx = count * 4;
            
            // Position + Radius
            posData[idx] = pos.x;
            posData[idx+1] = pos.y;
            posData[idx+2] = pos.z;
            posData[idx+3] = radius;
            
            // Velocity + Strength
            velData[idx] = vel.x;
            velData[idx+1] = vel.y;
            velData[idx+2] = vel.z;
            velData[idx+3] = 1.0; 
            
            count++;
        };

        // Check hands
        this.hands.forEach((hand, handIndex) => {
            if (hand.visible && hand.joints) {
                jointsToTrack.forEach(name => {
                    const joint = hand.joints[name];
                    if (joint) {
                        const pos = new THREE.Vector3();
                        joint.getWorldPosition(pos);
                        // Accurate finger radius (~1.5cm) for precise collision
                        addInteractor(`h${handIndex}_${name}`, pos, 0.015); 
                    }
                });

                // Add Wrist/Palm
                if (hand.joints['wrist']) {
                    const pos = new THREE.Vector3();
                    hand.joints['wrist'].getWorldPosition(pos);
                    addInteractor(`h${handIndex}_wrist`, pos, 0.04);
                }
            }
        });

        // Fallback for controllers
        this.controllers.forEach((controller, i) => {
            // Only add controller if corresponding hand is not visible/tracked
            if (controller.visible && (!this.hands[i] || !this.hands[i].visible)) {
                if (count < 50) {
                    const pos = controller.position.clone();
                    addInteractor(`c${i}`, pos, 0.08); 
                }
            }
        });
        
        return { posData, velData, count };
    }
}

