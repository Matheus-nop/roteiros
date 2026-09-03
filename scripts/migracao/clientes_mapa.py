"""Unificação de nomes de clientes da planilha.

Cada regra é (regex sobre o nome normalizado sem acentos/maiúsculo, nome canônico).
As grafias originais viram apelidos do cliente no banco, então nada se perde e a busca continua achando.
Nomes que não casam com nenhuma regra passam só pela limpeza genérica (sufixos LTDA/S.A/SPE etc.).
"""
import re, unicodedata

REGRAS = [
    (r'^(AEGEA|AEGA)\b', 'ÁGUAS DO RIO'),
    (r'^(AGUAS|AGAUS|AGAS|AUAS) DO R[IO]O?\b', 'ÁGUAS DO RIO'),
    (r'AGUAS PLUVIA', 'CONSÓRCIO ÁGUAS PLUVIAIS'),
    (r'L[YT]T?[OI]RANEA|LTORANEA', 'CONSTRUTORA LYTORÂNEA'),
    (r'^RIO ?\+', 'RIO + SANEAMENTO'),
    (r'^VDI?NIZ', 'VDINIZ CONSTRUTORA'),
    (r'^BRACOS', 'BRAÇOS CONSTRUÇÕES'),
    (r'^EXECUT', 'EXECUT SERVIÇOS'),
    (r'MONTE NEGRO', 'CONSTRUTORA MONTE NEGRO'),
    (r'^OMEGA', 'OMEGA CONSTRUTORA'),
    (r'^CONCREJATO', 'CONCREJATO SERVIÇOS'),
    (r'^DUO LONDO', 'DUO LONDON'),
    (r'\bR2X\b|^RJ2X', 'CONSTRUTORA R2X'),
    (r'^ELCOP', 'ELCOP ENGENHARIA'),
    (r'^LITOSEG', 'LITOSEG'),
    (r'^NEVES\b', 'NEVES ESTRUTURA'),
    (r'^PRUDENTE', 'PRUDENTE DE MORAES'),
    (r'^ORIENTE', 'ORIENTE CONSTRUÇÃO'),
    (r'^SANERIO', 'SANERIO CONSTRUÇÕES'),
    (r'^F\.?A\.?B\.? ZONA O', 'F.A.B ZONA OESTE'),
    (r'^F\.?A\.?B\.? ZONA LESTE', 'F.A.B ZONA LESTE'),
    (r'^DRACHMA', 'DRACHMA MND'),
    (r'^ESTRE?UTURAL', 'ESTRUTURAL CONSTRUTORA'),
    (r'BR ?493', 'CONSÓRCIO CONSTRUTOR BR 493'),
    (r'^CE?BTEC', 'CBTEC CONSTRUÇÕES'),
    (r'^EQS', 'EQS ENGENHARIA'),
    (r'^JSA', 'JSA USINAGEM MECÂNICA'),
    (r'^M\.? ROCHA', 'M ROCHA CONSTRUÇÕES'),
    (r'^CINETICA', 'CINÉTICA INFRAESTRUTURA'),
    (r'^INCOPRE', 'INCOPRE'),
    (r'^DCH', 'DCH PERFURAÇÃO'),
    (r'RJL2', 'CONSTRUTORA RJL2'),
    (r'^NORSIL', 'NORSIL QUÍMICA'),
    (r'^ENGESIM', 'ENGESIM ENGENHARIA'),
    (r'^LUDOLF', 'LUDOLF 47'),
    (r'MAN(UTENCAO|\.) (DE PASSEIOS )?AP ?4|^CONSORCIO MANUTENCAO$', 'CONSÓRCIO MANUTENÇÃO DE PASSEIOS AP4'),
    (r'MAN(UTENCAO|\.) (DE PASSEIOS )?AP ?5', 'CONSÓRCIO MANUTENÇÃO DE PASSEIOS AP5'),
    (r'MAN(UTENCAO|\.) (DE PASSEIOS )?AP ?6', 'CONSÓRCIO MANUTENÇÃO DE PASSEIOS AP6'),
    (r'ODONTOLOGIC[OA]', 'CENTRO ODONTOLÓGICO SORRIA RIO'),
    (r'AFFONSECA', 'CONSTRUTORA AFFONSECA'),
    (r'^CONSILUX', 'CONSILUX'),
    (r'^EMPRESA FLUMINENSE', 'EMPRESA FLUMINENSE DE SERVIÇOS'),
    (r'PARQUE CESARIO', 'CONSÓRCIO PARQUE CESÁRIO DE MELO'),
    (r'^RS H SILVA', 'RS H SILVA CONSTRUÇÃO E REFORMAS'),
    (r'^ENGENHAR\b', 'ENGENHAR CONSTRUTORA'),
    (r'^ASSERTIVA', 'ASSERTIVA'),
    (r'^TEL TELECOM', 'TEL TELECOMUNICAÇÕES'),
    (r'BE IN', 'CONSÓRCIO BE IN RIO'),
    (r'^RJR?E II', 'RJRE II EMPREENDIMENTOS'),
    (r'^HILARIO DE GOUVEIA', 'HILARIO DE GOUVEIA EMPREENDIMENTOS'),
    (r'^RENQUIP', 'RENQUIP'),
    (r'CTS ETE', 'CONSÓRCIO CTS ETE SÃO GONÇALO'),
    (r'^NOV[OA] SONAP', 'NOVO SONAP'),
    (r'^ADELINO SOARES', 'ADELINO SOARES'),
    (r'^INFRATECH', 'INFRATECH'),
    (r'^SOLIDA REFORMA', 'SÓLIDA REFORMA E CONSTRUÇÃO'),
    (r'^EMERSON PAES', 'EMERSON PAES'),
    (r'^A S SISTEMA', 'A S SISTEMAS'),
    (r'^HELIO MOREIRA', 'HELIO MOREIRA'),
    (r'^IRMAOS BOAVENTURA', 'IRMÃOS BOAVENTURA'),
    (r'^IGOR DOS SANTOS', 'IGOR DOS SANTOS'),
    (r'^DARWIN', 'DARWIN ENGENHARIA'),
    (r'SOUL RIO', 'CONSÓRCIO SOUL RIO'),
    (r'^FORCA AMBIENTAL', 'FORÇA AMBIENTAL'),
    (r'^DIEGO SANTOS', 'DIEGO SANTOS MACENA'),
    (r'^UNIAO NORTE', 'UNIÃO NORTE'),
    (r'^BARRATIBA', 'BARRATIBA'),
    (r'^TENSOR', 'TENSOR EMPREENDIMENTOS'),
    (r'^STHAI', 'STHAI ENGENHARIA'),
    (r'^VISIONE 10', 'VISIONE 10'),
    (r'^BRUNO RODRIGUES', 'BRUNO RODRIGUES DA SILVA'),
    (r'^ELTON LOUREIRO', 'ELTON LOUREIRO DOS SANTOS'),
    (r'^SAIORON', 'SAIORON'),
    (r'^WJS', 'WJS COMUNICAÇÃO VISUAL'),
    (r'^RASSINI', 'RASSINI-NHK'),
    (r'^CONSTRUT?PERJ', 'CONSTRUPERJ'),
    (r'^PAULO GOUVE', 'PAULO GOUVEIA APARICIO'),
    (r'^PAULO FERNANDO', 'PAULO FERNANDO FERREIRA'),
    (r'^MARC[IO]O COURAS', 'MARCIO COURAS RAMOS'),
    (r'FAVELAS? URBANIZADAS|^CONSORCIO FAVELA$', 'CONSÓRCIO FAVELAS URBANIZADAS'),
    (r'ACARI', 'CONSÓRCIO RIO ACARI'),
    (r'^JC MORAES', 'JC MORAES'),
    (r'SANEAMENTO MINEIRO', 'CONSÓRCIO SANEAMENTO MINEIRO'),
    (r'^PEDRO MARCO', 'PEDRO MARCO BERTINE'),
    (r'^J M SERVICE', 'J M SERVICE'),
    (r'RUA DA CERVEJA', 'CONSÓRCIO RUA DA CERVEJA'),
    (r'URBANIZA MARIC', 'CONSÓRCIO URBANIZA MARICÁ'),
    (r'EXPRESSO LINHA 4|^AERO MECANICA', 'CONSÓRCIO EXPRESSO LINHA 4'),
]
SUFIXOS = r'\s*(-\s*)?(EM RECUPERACAO JUDICIAL|LTDA\.?|S\.?/?A\.?|SPE|EIRELI|ME|EPP|LIMITADA)\s*$'

def _norm(s):
    s = unicodedata.normalize('NFD', str(s)).encode('ascii', 'ignore').decode()
    return re.sub(r'\s+', ' ', s).strip().upper()

_cache = {}
def canonico(nome):
    """Nome canônico do cliente (mantém acentos do canônico; genéricos vêm limpos de sufixos)."""
    if not nome: return None
    if nome in _cache: return _cache[nome]
    n = _norm(nome)
    out = None
    for rx, canon in REGRAS:
        if re.search(rx, n): out = canon; break
    if out is None:
        limpo = n
        for _ in range(3): limpo = re.sub(SUFIXOS, '', limpo).strip(' -.,')
        out = limpo or n
    _cache[nome] = out
    return out
