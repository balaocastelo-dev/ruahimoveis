# Rocketbox FBX (personagem + animações Biped) -> GLB para o escritório 3D do Herrera HOUSE IA.
# uso: python3 -I converte.py <slug> <PastaDoPersonagem> <m|f> <saida.glb> [quadros_max]
import bpy, sys, os, glob, math

modo, slug, pasta, genero, saida = sys.argv[1:6]
QMAX = int(sys.argv[6]) if len(sys.argv) > 6 else 150
ROOT = '/home/claude/microsoft/microsoft-rocketbox/Assets/Animations'
ANIMS = {  # nome no GLB: (pasta, arquivo)  — as "static" são no lugar; "xy" = andar com o deslocamento extraído (anda no lugar)
    'idle': ('static', '{g}_idle_neutral_01'),
    'olhar': ('static', '{g}_idle_look_around_01'),
    'sentado': ('static', '{g}_sit_table_idle_neutral_01'),
    'respira': ('static', '{g}_sit_table_breathe_01'),
    'digita': ('static', '{g}_work_table'),
    'pensa': ('static', '{g}_sit_table_gestic_thoughtful'),
    'alonga': ('static', '{g}_idle_stretch_arms_01'),
    'acena': ('static', '{g}_wave_01'),
    'bebe': ('static', '{g}_drink_drinking'),
    'celular': ('static', '{g}_cell_phone_textmessage'),
    'fala': ('static', '{g}_gestic_talk_neutral_01'),
    'papel': ('static', '{g}_documents_idle'),
    'anda': ('xy', '{g}_walk_neutral_01'),
}
LOOP = {'idle', 'olhar', 'sentado', 'respira', 'digita', 'anda'}

bpy.ops.wm.read_factory_settings(use_empty=True)
nome = os.path.basename(pasta.rstrip('/'))
fbx = os.path.join(pasta, 'Export', nome + '.fbx')
bpy.ops.import_scene.fbx(filepath=fbx, ignore_leaf_bones=True, use_anim=False)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh = next(o for o in bpy.data.objects if o.type == 'MESH')
for o in list(bpy.data.objects):
    if o.type == 'EMPTY': bpy.data.objects.remove(o)
arm.name = 'Bip01'; mesh.name = slug

# ---------- texturas: religa pelos nomes, reduz e monta PBR ----------
tex = {os.path.basename(p).lower(): p for p in glob.glob(os.path.join(pasta, 'Textures', '*.tga'))}
TMP = '/home/claude/rb/tmp-tex'; os.makedirs(TMP, exist_ok=True)
def imagem(nome_arq, tam, alpha=False):
    p = tex.get(nome_arq.lower())
    if not p: return None
    from PIL import Image
    im = Image.open(p); im = im.convert('RGBA' if alpha else 'RGB')
    if im.size[0] > tam: im = im.resize((tam, tam), Image.LANCZOS)
    dest = os.path.join(TMP, f'{slug}-{nome_arq[:-4]}-{tam}.png'); im.save(dest)
    img = bpy.data.images.load(dest, check_existing=True)
    img.alpha_mode = 'STRAIGHT' if alpha else 'NONE'
    return img
for m in mesh.data.materials:
    if not m: continue
    m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes): nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    base = m.name.lower()  # f014_body / f014_head / f014_opacity
    cod, parte = base.split('_', 1)
    if parte == 'opacity':
        img = imagem(f'{cod}_opacity_color.tga', 1024, alpha=True)
        if img:
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
            nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color']); nt.links.new(t.outputs['Alpha'], bsdf.inputs['Alpha'])
        m.surface_render_method = 'BLENDED' if hasattr(m, 'surface_render_method') else None
        bsdf.inputs['Roughness'].default_value = 0.65
    else:
        img = imagem(f'{cod}_{parte}_color.tga', 1024)
        if img:
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
            nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
        nrm = imagem(f'{cod}_{parte}_normal.tga', 512)
        if nrm:
            nrm.colorspace_settings.name = 'Non-Color'
            tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = nrm
            nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.6
            nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
        bsdf.inputs['Roughness'].default_value = 0.55 if parte == 'head' else 0.8
    bsdf.inputs['Metallic'].default_value = 0.0

# ---------- animações: importa cada FBX, rouba a action do Bip01, apaga o resto ----------
def importa_src(pasta_anim, arq):
    objs_antes = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(ROOT, f'all_animations_max_motextr_{pasta_anim}', arq + '.max.fbx'), ignore_leaf_bones=True, use_anim=True)
    novos = [o for o in bpy.data.objects if o not in objs_antes]
    src = next((o for o in novos if o.type == 'ARMATURE'), None)
    return src, novos

def rebake(src, dst, nome, qmax, passo=1):
    """Transfere a animação de src (esqueleto do arquivo de animação, com a pose de descanso dele) para dst (personagem)
    comparando as matrizes locais ABSOLUTAS de cada osso: o descanso dos arquivos de animação do Rocketbox não é a A-pose."""
    act = bpy.data.actions.new(nome)
    dst.animation_data.action = act
    try: dst.animation_data.action_slot = act.slots.new(id_type='OBJECT', name='Bip01')
    except Exception as e: print('slot', e)
    bones_dst = {b.name for b in dst.data.bones}
    fim = int(min(qmax, src.animation_data.action.frame_range[1]))
    rest = {}
    for b in dst.data.bones:
        rest[b.name] = (b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local.copy()
    for f in range(1, fim + 1, passo):
        bpy.context.scene.frame_set(f)
        for ps in src.pose.bones:
            n = ps.name
            if n not in bones_dst: continue
            M = (ps.parent.matrix.inverted() @ ps.matrix) if ps.parent else ps.matrix.copy()
            pd = dst.pose.bones[n]
            basis = rest[n].inverted() @ M
            pd.matrix_basis = basis
            pd.keyframe_insert('rotation_quaternion', frame=f)
            if n == 'Bip01 Pelvis': pd.keyframe_insert('location', frame=f)
    dst.animation_data.action = None
    return act

arm.animation_data_create()
for pb in arm.pose.bones: pb.rotation_mode = 'QUATERNION'
for nome_glb in ([] if modo == 'p' else list(ANIMS)):
    pa, arq = ANIMS[nome_glb]
    src, novos = importa_src(pa, arq.format(g=genero))
    if not src: print('SEM animação', nome_glb); continue
    act = rebake(src, arm, nome_glb, QMAX if nome_glb in LOOP else min(QMAX, 120), passo=2)
    for o in novos: bpy.data.objects.remove(o)
    for a in list(bpy.data.actions):
        if a.name != nome_glb and a.name not in ANIMS: bpy.data.actions.remove(a)
    act.use_fake_user = True
    tr = arm.animation_data.nla_tracks.new(); tr.name = nome_glb
    st = tr.strips.new(nome_glb, 1, act)
    try: st.action_slot = act.slots[0]
    except Exception as e: print('slot', e)
    tr.mute = True
print('actions', [a.name for a in bpy.data.actions])

# ---------- exporta ----------
bpy.ops.object.select_all(action='DESELECT')
arm.select_set(True)
if modo == 'p': mesh.select_set(True)
else: bpy.data.objects.remove(mesh)
bpy.ops.export_scene.gltf(filepath=saida, export_format='GLB', use_selection=True,
    export_image_format='WEBP', export_image_quality=82, export_image_webp_fallback=False, export_texcoords=True, export_normals=True, export_materials='EXPORT',
    export_animations=True, export_animation_mode='NLA_TRACKS', export_frame_step=2, export_force_sampling=True,
    export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True, export_skins=True, export_all_influences=False,
    export_rest_position_armature=True, export_yup=True, export_apply=False, export_morph=False)
print('ok', saida, os.path.getsize(saida))
