import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { disposeObject } from '@/lib/disposeThree';

// A small 3D person figure that lives in the toolbar next to the buttons.
// Drag it onto the 3D property to become the person and enter first-person there,
// or tap/click it (touch has no HTML5 drag) to walk in from the last spot.
export default function WalkThroughHandle({ size = 50, onActivate, compact = false }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(2.4, 3.1, 8.4);
    camera.lookAt(0, 2.3, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x556b3a, 0.95));
    const dir = new THREE.DirectionalLight(0xfff2d6, 1.15);
    dir.position.set(4, 8, 5);
    scene.add(dir);

    const skin = new THREE.MeshStandardMaterial({ color: 0xe7b48f, roughness: 0.6, flatShading: true });
    const shirt = new THREE.MeshStandardMaterial({ color: 0x2a6f97, roughness: 0.55, flatShading: true });
    const pants = new THREE.MeshStandardMaterial({ color: 0x324a5a, roughness: 0.7, flatShading: true });
    const person = new THREE.Group();

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), skin);
    head.position.y = 5.05;
    person.add(head);
    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.22, 10), skin);
    neck.position.y = 4.62;
    person.add(neck);
    // Torso (tapered shoulders -> waist)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.4, 1.5, 14), shirt);
    torso.position.y = 3.75;
    person.add(torso);
    // Shoulders cap
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.52, 14, 10), shirt);
    shoulders.scale.set(1, 0.42, 0.7);
    shoulders.position.y = 4.42;
    person.add(shoulders);
    // Arms (two cylinders angled slightly out and down)
    const armGeo = new THREE.CylinderGeometry(0.13, 0.11, 1.5, 10);
    const armL = new THREE.Mesh(armGeo, shirt);
    armL.position.set(0.62, 3.7, 0);
    armL.rotation.z = 0.22;
    person.add(armL);
    const armR = new THREE.Mesh(armGeo, shirt);
    armR.position.set(-0.62, 3.7, 0);
    armR.rotation.z = -0.22;
    person.add(armR);
    // Hands
    const handGeo = new THREE.SphereGeometry(0.14, 10, 8);
    const handL = new THREE.Mesh(handGeo, skin);
    handL.position.set(0.8, 2.98, 0);
    person.add(handL);
    const handR = new THREE.Mesh(handGeo, skin);
    handR.position.set(-0.8, 2.98, 0);
    person.add(handR);
    // Legs (two cylinders)
    const legGeo = new THREE.CylinderGeometry(0.16, 0.14, 2.2, 10);
    const legL = new THREE.Mesh(legGeo, pants);
    legL.position.set(0.2, 1.6, 0);
    person.add(legL);
    const legR = new THREE.Mesh(legGeo, pants);
    legR.position.set(-0.2, 1.6, 0);
    person.add(legR);
    // Feet
    const footGeo = new THREE.BoxGeometry(0.26, 0.16, 0.5);
    const footL = new THREE.Mesh(footGeo, pants);
    footL.position.set(0.2, 0.42, 0.12);
    person.add(footL);
    const footR = new THREE.Mesh(footGeo, pants);
    footR.position.set(-0.2, 0.42, 0.12);
    person.add(footR);

    person.position.y = 0;
    scene.add(person);

    const base = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.5, 28),
      new THREE.MeshBasicMaterial({ color: 0x2a6f97, side: THREE.DoubleSide, transparent: true, opacity: 0.4 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.y = 0.02;
    scene.add(base);

    let frame;
    let t = 0;
    let last = 0;
    const animate = (now) => {
      frame = requestAnimationFrame(animate);
      // ~12fps keeps the spin readable while cutting continuous GPU load at rest.
      if (now - last < 80) return;
      last = now;
      t += 0.012;
      person.rotation.y = t;
      renderer.render(scene, camera);
    };
    animate(0);

    return () => {
      cancelAnimationFrame(frame);
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [size]);

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', 'person'); e.dataTransfer.effectAllowed = 'copy'; }}
      role="button"
      tabIndex={0}
      onClick={() => onActivate?.()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate?.(); } }}
      className={`flex items-center rounded-full border border-border bg-card cursor-grab active:cursor-grabbing hover:border-primary/40 transition ${compact ? 'gap-1 py-0 pl-0.5 pr-2.5' : 'gap-2 py-1 pl-1.5 pr-3'}`}
      title="Tap to walk through, or drag onto the property to start at a spot"
      aria-label="Walk through: tap, or drag onto the property"
    >
      <div ref={mountRef} style={{ width: size, height: size }} className="shrink-0" />
      {compact ? (
        <span className="text-[11.5px] text-muted-foreground">Walk</span>
      ) : (
        <span className="text-[11px] leading-tight text-muted-foreground">
          Tap to walk, or
          <br />
          drag onto the lot
        </span>
      )}
    </div>
  );
}