import { Schema } from "effect"

export const FilmId = Schema.String.pipe(Schema.brand("FilmId"))
export type FilmId = Schema.Schema.Type<typeof FilmId>

export const makeFilmId = (raw: string): FilmId => Schema.decodeSync(FilmId)(raw)

export const FilmFormat = Schema.Literal("135", "120")
export type FilmFormat = Schema.Schema.Type<typeof FilmFormat>

/** 冲洗样片（用户可上传） */
export const SampleImage = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  uploadedBy: Schema.String,
})
export type SampleImage = Schema.Schema.Type<typeof SampleImage>

/** 与商家谈妥的团购优惠条件（当前为 mock 数据） */
export const DealTerms = Schema.Struct({
  /** 成团所需人数 */
  threshold: Schema.Int,
  /** 成团价（单位：分） */
  groupBuyPriceInCents: Schema.Int,
})
export type DealTerms = Schema.Schema.Type<typeof DealTerms>

/**
 * Film 聚合：胶卷商品。
 * 特性 / 适用场景 / 冲洗样片都随商品一起维护。
 */
export class Film extends Schema.Class<Film>("Film")({
  id: FilmId,
  name: Schema.String,
  brand: Schema.String,
  format: FilmFormat,
  iso: Schema.Int,
  /** 冲洗工艺：C-41 / E-6 / 黑白(D-76) 等 */
  process: Schema.String,
  features: Schema.Array(Schema.String),
  scenarios: Schema.Array(Schema.String),
  sampleImages: Schema.Array(SampleImage),
  basePriceInCents: Schema.Int,
  deal: DealTerms,
}) {
  static create(input: {
    id: FilmId
    name: string
    brand: string
    format: FilmFormat
    iso: number
    process: string
    features: ReadonlyArray<string>
    scenarios: ReadonlyArray<string>
    sampleImages: ReadonlyArray<SampleImage>
    basePriceInCents: number
    deal: DealTerms
  }): Film {
    return new Film({
      id: input.id,
      name: input.name,
      brand: input.brand,
      format: input.format,
      iso: input.iso,
      process: input.process,
      features: input.features,
      scenarios: input.scenarios,
      sampleImages: input.sampleImages,
      basePriceInCents: input.basePriceInCents,
      deal: input.deal,
    })
  }

  addSampleImage(image: SampleImage): Film {
    return new Film({ ...this, sampleImages: [...this.sampleImages, image] })
  }
}
