import { AolService } from './aol.js'
import { AplisService } from './aplis.js'
import { ExamResultRepository } from './repository.js'
import { LaudoService } from './service.js'

// Instância única usada pelas rotas. As dependências são injetadas no construtor
// (e não importadas lá dentro) para os testes poderem trocar LIS e repositório
// por dublês sem tocar na rede.
export const laudoService = new LaudoService(
  new ExamResultRepository(),
  new AplisService(),
  new AolService(),
)

export { LaudoService } from './service.js'
export { DatabaseError, IntegrationError, LaudoError, ValidationError } from './errors.js'
