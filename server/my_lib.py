# ...
class Log:
    def __init__(self, file: str = 'logger.log', method: str = "a") -> None:
        self.file, self.comm = file, f"open(file, 'a', encoding='utf-8')"
        open(file, method, encoding='utf-8').close()

    def log(self, string: str, slice: str = ' ', fw: str = '', fp: str = ''):
        eval(self.comm, {'file': self.file}).write(
            string+((slice+fw) if fw else '')+'\n')
        print(string+((slice+fp) if fp else ''))

    def __str__(self) -> str:
        return f'Logger to {self.file}.'
# ...
