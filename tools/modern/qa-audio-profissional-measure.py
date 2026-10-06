"""Measure browser recordings; objective waveform data is not a listening review."""
import array
import json
import math
import subprocess
from pathlib import Path

OUT = Path('C:/Users/Alcione/Documents/Codex/2026-10-06/valadare/work/revisao-profissional/audio-evidence')

def db(value):
    return round(20 * math.log10(value), 2) if value else None

results = {}
for label in ['baseline', 'candidate-final', 'game-live', 'lethal-final']:
    audio = OUT / f'{label}.webm'
    if not audio.exists():
        continue
    data = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(audio), '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'], capture_output=True, check=True).stdout
    pcm = array.array('f')
    pcm.frombytes(data)
    trace = json.loads((OUT / f'{label}.json').read_text(encoding='utf8'))['trace']
    marks = [event for event in trace if event['type'] == 'scene']
    sections = []
    for i, mark in enumerate(marks):
        end = marks[i+1]['t'] if i+1 < len(marks) else len(pcm)/48000
        # MediaRecorder/Opus can shift the recording by a few render quanta.
        # Exclude both transition edges, not only the attack, for level/mute measures.
        segment = pcm[int((mark['t'] + .25)*48000):int(max(mark['t']+.25,end-.25)*48000)]
        if not segment:
            continue
        sections.append({'scene': mark['scene'], 'from': mark['t'], 'to': end,
                         'peakDbfs': db(max(map(abs, segment))),
                         'rmsDbfs': db(math.sqrt(sum(x*x for x in segment)/len(segment))),
                         'clippedSamples': sum(abs(x)>=1 for x in segment)})
    sample_events = [e for e in trace if e['type'] == 'source' and not e.get('loop') and e.get('asset') != 'synthesis']
    repeat = sum(a['asset']==b['asset'] for a,b in zip(sample_events, sample_events[1:]))
    results[label] = {'duration':len(pcm)/48000, 'peakDbfs':db(max(map(abs, pcm))),
                      'clippedSamples':sum(abs(x)>=1 for x in pcm),
                      'directSampleRepeats':repeat, 'sampleEvents':len(sample_events), 'sections':sections}
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(audio),'-c:a','pcm_s16le',str(OUT/f'{label}.wav')],check=True)
(OUT/'measurements.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf8')
print(json.dumps(results,indent=2))
