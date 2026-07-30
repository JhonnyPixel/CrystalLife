# Modelli delle gemme

Ogni cartella controlla una gemma:

- `centro` — gemma principale
- `mente`
- `corpo`
- `disciplina`
- `relazioni`
- `crescita`

Per cambiare una gemma:

1. Apri il modello in Blender con l'add-on Verge3D.
2. Esporta come Verge3D glTF.
3. Rinomina il `.gltf` in `gemme.gltf` e il `.bin` in `gemme.bin`.
4. Sostituisci entrambi i file nella cartella scelta.

Percorsi e codice restano invariati. Il loader corregge automaticamente anche
il nome originale del `.bin` scritto dentro al file `.gltf`.

Se i file della cartella `centro` non esistono, CrystalLife usa
automaticamente la gemma centrale geometrica integrata.
