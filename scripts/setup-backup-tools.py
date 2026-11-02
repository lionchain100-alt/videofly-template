"""Install only official PostgreSQL 17 client executables into ignored .local.
Linux/macOS: install PostgreSQL 17 client with your OS package manager instead.
"""
import io, json, pathlib, shutil, urllib.request, zipfile, hashlib, sys
root=pathlib.Path(__file__).resolve().parent.parent
url='https://get.enterprisedb.com/postgresql/postgresql-17.11-1-windows-x64-binaries.zip'
class RemoteZip(io.RawIOBase):
 def __init__(self):
  self.pos=0
  with urllib.request.urlopen(urllib.request.Request(url,method='HEAD'),timeout=30) as r:self.size=int(r.headers['Content-Length'])
 def seekable(self):return True
 def tell(self):return self.pos
 def seek(self,n,whence=0):self.pos=n if whence==0 else self.pos+n if whence==1 else self.size+n;return self.pos
 def read(self,n=-1):
  if n<0:n=self.size-self.pos
  n=min(n,self.size-self.pos)
  if n<=0:return b''
  req=urllib.request.Request(url,headers={'Range':f'bytes={self.pos}-{self.pos+n-1}'})
  with urllib.request.urlopen(req,timeout=60) as r:
   if r.status!=206:raise RuntimeError('Official server did not honor bounded Range request')
   data=r.read(n)
  self.pos+=len(data);return data
if sys.platform!='win32':raise SystemExit('Use PostgreSQL 17 clients from your OS or PG_BIN_DIR')
target=root/'.local/pg-tools';target.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(RemoteZip()) as z:
 for name in ['pg_dump.exe','pg_restore.exe']:
  matches=[i for i in z.infolist() if i.filename.endswith('/bin/'+name)]
  if len(matches)!=1:raise RuntimeError('Official client entry not found')
  (target/name).write_bytes(z.read(matches[0]))
dllroots=list((root/'node_modules/.pnpm').glob('@embedded-postgres+windows-x64@*/node_modules/@embedded-postgres/windows-x64/native/bin'))
if not dllroots:raise RuntimeError('Install project dependencies first')
for source in dllroots[0].glob('*.dll'):shutil.copy2(source,target/source.name)
(target/'PROVENANCE.json').write_text(json.dumps({'source':url,'version':'17.11','executables':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in target.glob('*.exe')},'dllSource':'Existing embedded-postgres Windows package'},indent=2),encoding='utf-8')
print('PostgreSQL clients prepared in .local/pg-tools; credentials are not required for setup')
