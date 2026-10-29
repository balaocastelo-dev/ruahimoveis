"""Prepara as texturas do escritório: Python + Pillow + numpy (sem serviços externos).

Uso: python scripts/preparar-cenario.py C:/Users/user/demo-herrera/cenario
As provas 2x2 e o relatório ficam em data/cenario-qa/ (fora do Git).
"""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
TEXTURAS = {
    "piso-carvalho": 2.0, "parede-reboco": 1.5, "concreto": 2.0,
    "tecido-cadeira": 2.5, "tecido-sofa": 2.5, "tampo-carvalho": 1.8,
    "nogueira": 1.8, "marmore": 1.0, "tapete": 2.5,
}


def repetivel(imagem):
    """Espelha um quadrante em x/y: bordas idênticas sem faixas de mistura.

    O espelhamento é a alternativa prevista na tarefa. Suaviza primeiro a
    iluminação ampla da foto para não repetir manchas claras nos tecidos.
    """
    pequena = imagem.resize((512, 512), Image.Resampling.LANCZOS)
    pixels = np.asarray(pequena, dtype=np.float32)
    iluminacao = np.asarray(pequena.filter(ImageFilter.GaussianBlur(96)), dtype=np.float32)
    pixels = np.clip(pixels - 0.75 * (iluminacao - iluminacao.mean(axis=(0, 1))), 0, 255).astype(np.uint8)
    metade = np.concatenate((pixels, pixels[:, ::-1]), axis=1)
    return Image.fromarray(np.concatenate((metade, metade[::-1]), axis=0))


def normal_tangente(imagem, intensidade):
    pequena = imagem.resize((512, 512), Image.Resampling.LANCZOS).convert("L")
    # Desfoque periódico: evita criar outra emenda ao calcular o relevo.
    mosaico = Image.fromarray(np.tile(np.asarray(pequena), (3, 3)))
    altura = np.asarray(mosaico.filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float32)[512:1024, 512:1024] / 255
    gx = np.zeros_like(altura)
    gy = np.zeros_like(altura)
    for offset, peso in ((-1, 1), (0, 2), (1, 1)):
        linha = np.roll(altura, offset, axis=0)
        coluna = np.roll(altura, offset, axis=1)
        gx += peso * (np.roll(linha, -1, axis=1) - np.roll(linha, 1, axis=1)) / 8
        gy += peso * (np.roll(coluna, -1, axis=0) - np.roll(coluna, 1, axis=0)) / 8
    # OpenGL/three.js: +Y aponta para cima na textura (imagem tem y para baixo).
    normal = np.stack((-gx * intensidade, gy * intensidade, np.ones_like(altura)), axis=2)
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    return Image.fromarray(np.clip((normal * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("origem", type=Path)
    args = parser.parse_args()
    destino = ROOT / "public/plataforma/cenario"
    provas = ROOT / "data/cenario-qa"
    destino.mkdir(parents=True, exist_ok=True)
    provas.mkdir(parents=True, exist_ok=True)
    painel = Image.new("RGB", (1200, 1272), "#ececec")
    texto = ImageDraw.Draw(painel)
    relatorio = {}
    for i, (nome, intensidade) in enumerate(TEXTURAS.items()):
        with Image.open(args.origem / f"{nome}.png") as entrada:
            cor = repetivel(entrada.convert("RGB").resize((1024, 1024), Image.Resampling.LANCZOS))
        cor.save(destino / f"{nome}.jpg", quality=86, optimize=True)
        normal_tangente(cor, intensidade).save(destino / f"{nome}-n.jpg", quality=86, subsampling=0, optimize=True)
        with Image.open(destino / f"{nome}.jpg") as jpg:
            a = np.asarray(jpg, dtype=np.float32)
            relatorio[nome] = {
                "emenda_x_media": round(float(np.abs(a[:, 0] - a[:, -1]).mean()), 2),
                "emenda_y_media": round(float(np.abs(a[0] - a[-1]).mean()), 2),
                "variacao_interna_media": round(float((np.abs(np.diff(a, axis=0)).mean() + np.abs(np.diff(a, axis=1)).mean()) / 2), 2),
            }
            repetida = Image.fromarray(np.tile(np.asarray(jpg), (2, 2, 1)))
        repetida.save(provas / f"{nome}-2x2.jpg", quality=90)
        x, y = (i % 3) * 400, (i // 3) * 424
        painel.paste(repetida.resize((400, 400), Image.Resampling.LANCZOS), (x, y + 24))
        texto.text((x + 8, y + 6), nome, fill="black")
    for periodo in ("dia", "tarde", "noite"):
        with Image.open(args.origem / f"cidade-{periodo}.png") as entrada:
            entrada.convert("RGB").resize((2048, 768), Image.Resampling.LANCZOS).save(destino / f"cidade-{periodo}.jpg", quality=84, optimize=True)
    total = sum(p.stat().st_size for p in destino.glob("*.jpg"))
    relatorio["bytes_total"] = total
    (provas / "texturas.json").write_text(json.dumps(relatorio, indent=2), encoding="utf-8")
    painel.save(provas / "texturas-2x2.jpg", quality=90)
    print(json.dumps(relatorio, indent=2))
    if total >= 4_000_000:
        raise SystemExit("Texturas ultrapassam a meta de 4 MB")


if __name__ == "__main__":
    main()
