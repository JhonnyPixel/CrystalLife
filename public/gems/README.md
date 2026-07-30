# Modelli delle gemme

Ogni cartella controlla una gemma:

- `centro` — gemma principale
- `mente`
- `corpo`
- `disciplina`
- `relazioni`
- `crescita`

Per cambiare qualsiasi gemma:

1. Apri il modello in Blender con l'add-on Verge3D.
2. Esporta come Verge3D glTF.
3. Elimina il vecchio `.gltf`/`.glb` e il relativo `.bin`.
4. Copia il nuovo export nella cartella scelta mantenendo qualsiasi nome.

Esempi validi:

- `sun.gltf` e `sun.bin`
- `mind-crystal.gltf` e `mind-crystal.bin`
- un singolo `body.glb`

Mantieni un solo `.gltf` o `.glb` per cartella. Il `.bin` può avere un nome
diverso se quel nome è già indicato dentro al `.gltf`.

Vite rileva automaticamente modello e buffer di tutte le gemme. Se il modello
centrale non esiste, CrystalLife usa la gemma geometrica integrata.
