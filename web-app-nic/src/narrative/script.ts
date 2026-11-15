// Mission-director script: which dialogue key plays with which expression/gesture.
export type Expression = 'neutral' | 'happy' | 'concerned' | 'surprised' | 'serious';
export type Gesture = 'none' | 'point' | 'thumbs';

export interface Line {
  readonly key: string;
  readonly expr: Expression;
  readonly gesture?: Gesture;
}

export const SCRIPT: Record<string, readonly Line[]> = {
  transmission: [
    { key: 'dlg.tx.1', expr: 'happy' },
    { key: 'dlg.tx.2', expr: 'serious', gesture: 'point' },
    { key: 'dlg.tx.3', expr: 'neutral' },
    { key: 'dlg.tx.4', expr: 'happy' },
  ],
  briefing: [
    { key: 'dlg.brief.1', expr: 'neutral', gesture: 'point' },
    { key: 'dlg.brief.2', expr: 'serious' },
  ],
  hangar: [
    { key: 'dlg.hangar.1', expr: 'happy' },
    { key: 'dlg.hangar.2', expr: 'neutral', gesture: 'point' },
  ],
  hangarTempt: [{ key: 'dlg.hangar.tempt', expr: 'surprised' }],
  hangarPower: [{ key: 'dlg.hangar.power', expr: 'concerned' }],
  hangarFit: [{ key: 'dlg.hangar.fit', expr: 'concerned' }],
  hangarGood: [{ key: 'dlg.hangar.good', expr: 'happy', gesture: 'thumbs' }],
  plan: [
    { key: 'dlg.plan.1', expr: 'neutral' },
    { key: 'dlg.plan.2', expr: 'serious', gesture: 'point' },
  ],
  ground: [{ key: 'dlg.ground.1', expr: 'neutral', gesture: 'point' }],
  lab: [{ key: 'dlg.lab.1', expr: 'serious' }],
  labFail: [{ key: 'dlg.lab.fail', expr: 'concerned' }],
  labInvalid: [{ key: 'dlg.lab.invalid', expr: 'serious', gesture: 'point' }],
  mrrNogo: [{ key: 'dlg.mrr.nogo', expr: 'concerned' }],
  mrrGo: [{ key: 'dlg.mrr.go', expr: 'happy', gesture: 'thumbs' }],
  launch: [{ key: 'dlg.launch.1', expr: 'serious' }],
  ops: [{ key: 'dlg.ops.1', expr: 'neutral' }],
  opsFc: [{ key: 'dlg.ops.fc', expr: 'happy', gesture: 'thumbs' }],
  opsCapture: [{ key: 'dlg.ops.capture', expr: 'neutral', gesture: 'point' }],
  opsDownlink: [{ key: 'dlg.ops.downlink', expr: 'serious' }],
  opsEclipse: [{ key: 'dlg.ops.eclipse', expr: 'concerned' }],
  opsBottleneck: [{ key: 'dlg.ops.bottleneck', expr: 'concerned' }],
  opsStorm: [{ key: 'dlg.ops.storm', expr: 'surprised' }],
  opsSafe: [{ key: 'dlg.ops.safe', expr: 'concerned' }],
  opsEnd: [{ key: 'dlg.ops.end', expr: 'neutral' }],
  debriefSuccess: [{ key: 'dlg.debrief.success', expr: 'happy', gesture: 'thumbs' }],
  debriefPartial: [{ key: 'dlg.debrief.partial', expr: 'neutral' }],
  debriefFailure: [{ key: 'dlg.debrief.failure', expr: 'serious' }],
};
