import { AolService } from './aol.js'
import { AplisService } from './aplis.js'
import { AplisSiteService, lerConfigAplisSite } from './aplisSite.js'
import { ExamResultRepository } from './repository.js'
import { LaudoOriginalService } from './laudoOriginal.js'
import { LaudoService } from './service.js'
import { LaudosExternosDoSite } from './vinculoPdf.js'

// Instância única usada pelas rotas. As dependências são injetadas no construtor
// (e não importadas lá dentro) para os testes poderem trocar LIS e repositório
// por dublês sem tocar na rede.
//
// A fonte dos PDFs "Laudo EXTERNO" só existe com as três APLIS_WEB_* definidas;
// sem elas o serviço recebe `null` e o caminho fica inerte, com ou sem a flag
// LAUDOS_OS_VIA_PDF. A instância do cliente é uma só, então a sessão do site é
// reaproveitada entre as buscas.
const configDoSite = lerConfigAplisSite()

const repositorio = new ExamResultRepository()
const aplis = new AplisService()
const laudosExternos = configDoSite ? new LaudosExternosDoSite(new AplisSiteService(configDoSite)) : null

export const laudoService = new LaudoService(repositorio, aplis, new AolService(), laudosExternos)

/** "Baixar laudo original" — mesma sessão do site que a busca de laudos usa. */
export const laudoOriginalService = new LaudoOriginalService(repositorio, aplis, laudosExternos)

export { LaudoService } from './service.js'
export { DatabaseError, IntegrationError, LaudoError, ValidationError } from './errors.js'
