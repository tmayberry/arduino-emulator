import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { AccelerometerReading } from "../emulator/workerProtocol";

interface AccelerationVectorProps {
  reading: AccelerometerReading;
}

function vectorColor(reading: AccelerometerReading): number {
  if (Math.abs(reading.x) > 1.5) return 0xef5d67;
  if (Math.abs(reading.y) > 1.5) return 0x28bd7f;
  return 0xf1ad3d;
}

export function AccelerationVector({ reading }: AccelerationVectorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const readingRef = useRef(reading);
  const resetRef = useRef<(() => void) | null>(null);
  const updateArrowRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    readingRef.current = reading;
    updateArrowRef.current?.();
  }, [reading]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (!("WebGLRenderingContext" in window)) {
      host.dataset.webglUnavailable = "true";
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      host.dataset.webglUnavailable = "true";
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-hidden", "true");
    host.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-6, 6, 5, -5, 0.1, 100);
    camera.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.minZoom = 0.7;
    controls.maxZoom = 2.5;

    const resetView = () => {
      camera.position.set(8, -8, 7);
      camera.zoom = 1;
      controls.target.set(0, 0, 0);
      camera.updateProjectionMatrix();
      controls.update();
    };
    resetRef.current = resetView;
    resetView();

    const axes = new THREE.AxesHelper(4.7);
    scene.add(axes);
    const makeAxisLabel = (
      text: string,
      color: string,
      position: THREE.Vector3,
    ) => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const context = canvas.getContext("2d");
      if (context) {
        context.fillStyle = color;
        context.beginPath();
        context.arc(48, 48, 38, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "white";
        context.font = "bold 48px system-ui";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(text, 48, 50);
      }
      const texture = new THREE.CanvasTexture(canvas);
      const material = new THREE.SpriteMaterial({
        map: texture,
        depthTest: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(position);
      sprite.scale.set(0.65, 0.65, 0.65);
      scene.add(sprite);
      return sprite;
    };
    const axisLabels = [
      makeAxisLabel("X", "#db4d5a", new THREE.Vector3(5, 0, 0)),
      makeAxisLabel("Y", "#26a66f", new THREE.Vector3(0, 5, 0)),
      makeAxisLabel("Z", "#347fd4", new THREE.Vector3(0, 0, 5)),
    ];
    const cube = new THREE.Box3Helper(
      new THREE.Box3(new THREE.Vector3(-4, -4, -4), new THREE.Vector3(4, 4, 4)),
      0x9aa5b8,
    );
    scene.add(cube);

    const makeThresholdPlane = (
      color: number,
      position: THREE.Vector3,
      rotation: THREE.Euler,
    ) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.055,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), material);
      mesh.position.copy(position);
      mesh.rotation.copy(rotation);
      scene.add(mesh);
      return mesh;
    };
    const thresholdPlanes = [
      makeThresholdPlane(
        0xef5d67,
        new THREE.Vector3(1.5, 0, 0),
        new THREE.Euler(0, Math.PI / 2, 0),
      ),
      makeThresholdPlane(
        0xef5d67,
        new THREE.Vector3(-1.5, 0, 0),
        new THREE.Euler(0, Math.PI / 2, 0),
      ),
      makeThresholdPlane(
        0x28bd7f,
        new THREE.Vector3(0, 1.5, 0),
        new THREE.Euler(Math.PI / 2, 0, 0),
      ),
      makeThresholdPlane(
        0x28bd7f,
        new THREE.Vector3(0, -1.5, 0),
        new THREE.Euler(Math.PI / 2, 0, 0),
      ),
    ];

    const direction = new THREE.Vector3(0, 0, 1);
    const arrow = new THREE.ArrowHelper(
      direction,
      new THREE.Vector3(),
      1,
      0xf1ad3d,
      0.28,
      0.16,
    );
    scene.add(arrow);

    const render = () => renderer.render(scene, camera);
    const updateArrow = () => {
      const current = readingRef.current;
      direction.set(current.x, current.y, current.z);
      const magnitude = direction.length();
      if (magnitude > 0.0001) {
        arrow.visible = true;
        arrow.setDirection(direction.normalize());
        arrow.setLength(
          magnitude,
          Math.min(0.35, magnitude * 0.3),
          Math.min(0.2, magnitude * 0.18),
        );
      } else {
        arrow.visible = false;
      }
      arrow.setColor(new THREE.Color(vectorColor(current)));
      render();
    };
    updateArrowRef.current = updateArrow;

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const aspect = width / height;
      const halfHeight = 5;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      render();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    controls.addEventListener("change", render);
    updateArrow();

    return () => {
      resizeObserver.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      arrow.line.geometry.dispose();
      (arrow.line.material as THREE.Material).dispose();
      arrow.cone.geometry.dispose();
      (arrow.cone.material as THREE.Material).dispose();
      axes.geometry.dispose();
      (axes.material as THREE.Material).dispose();
      for (const label of axisLabels) {
        label.material.map?.dispose();
        label.material.dispose();
      }
      cube.geometry.dispose();
      (cube.material as THREE.Material).dispose();
      for (const plane of thresholdPlanes) {
        plane.geometry.dispose();
        (plane.material as THREE.Material).dispose();
      }
      renderer.dispose();
      renderer.domElement.remove();
      resetRef.current = null;
      updateArrowRef.current = null;
    };
  }, []);

  return (
    <div className="vector-visualization">
      <div className="vector-canvas" ref={hostRef}>
        <span className="webgl-fallback">
          3D view unavailable; use the numeric readings below.
        </span>
      </div>
      <button
        className="vector-reset"
        type="button"
        onClick={() => resetRef.current?.()}
      >
        Reset view
      </button>
    </div>
  );
}
