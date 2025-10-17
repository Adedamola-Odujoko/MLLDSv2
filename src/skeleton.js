// src/skeleton.js
import {
  Group,
  Mesh,
  SphereGeometry,
  MeshStandardMaterial,
  LineBasicMaterial,
  BufferGeometry,
  Line,
  Color,
} from "three";

export const HIERARCHY = [
  { from: 0, to: 7 },
  { from: 7, to: 8 },
  { from: 8, to: 9 },
  { from: 9, to: 10 },
  { from: 7, to: 11 },
  { from: 11, to: 12 },
  { from: 12, to: 13 },
  { from: 7, to: 14 },
  { from: 14, to: 15 },
  { from: 15, to: 16 },
  { from: 0, to: 4 },
  { from: 4, to: 5 },
  { from: 5, to: 6 },
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 2, to: 3 },
];

export const teamColors = {
  Home: new Color(0x0074d9), // Blue for Home
  Away: new Color(0xff4136), // Red for Away
  Referee: new Color(0xffff00), // Yellow for Referee
  Ball: new Color(0xffffff), // White for the Ball
  Unknown: new Color(0x808080), // Grey for Unknown
};

export function createSkeleton() {
  const material = new MeshStandardMaterial({
    color: teamColors.Unknown,
    metalness: 0.1,
    roughness: 0.7,
  });
  const skeleton = new Group();
  const jointMeshes = Array(17)
    .fill(null)
    .map(() => new Mesh(new SphereGeometry(0.02, 5, 5), material));
  const boneLines = HIERARCHY.map(
    () =>
      new Line(
        new BufferGeometry(),
        new LineBasicMaterial({ linewidth: 2, color: material.color })
      )
  );

  jointMeshes.forEach((j) => skeleton.add(j));
  boneLines.forEach((b) => skeleton.add(b));

  skeleton.userData = { jointMeshes, boneLines, material };
  return skeleton;
}
