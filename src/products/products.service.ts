import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { PaginationDto } from 'src/common/dtos/pagination.dto';
import { validate as isUUID } from 'uuid';
import { ProductImage } from './entities';
import { User } from 'src/auth/entities/user.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger();

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly productImageRepository: Repository<ProductImage>,

    private readonly datasource: DataSource,
  ) {}

  async create(createProductDto: CreateProductDto, user: User) {
    // try {
    // if (!createProductDto.slug) {
    //   createProductDto.slug = createProductDto.title
    //     .toLowerCase()
    //     .replaceAll(' ', '_')
    //     .replaceAll("'", '');
    // } else {
    //   createProductDto.slug = createProductDto.slug
    //     .toLowerCase()
    //     .replaceAll(' ', '_')
    //     .replaceAll("'", '');
    // }
    try {
      const { images = [], ...productDetails } = createProductDto;
      const product = this.productRepository.create({
        ...productDetails,
        images: images.map((image) =>
          this.productImageRepository.create({ url: image }),
        ),
        user,
      });
      await this.productRepository.save(product);
      return { ...product, images };
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }

  //TODO: implement pagination
  async findAll(paginationDTo: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDTo;
    const products = await this.productRepository.find({
      take: limit,
      skip: offset,
      relations: { images: true },
    });

    return products.map((product) => ({ ...product, images: product.images }));
  }

  async findOne(term: string) {
    let product: Product;
    // const product = await this.productRepository.findOne({ where: { term } });
    if (isUUID(term)) {
      product = await this.productRepository.findOneBy({ id: term });
      return product;
    }
    // product = await this.productRepository.findOneBy({ slug: term });
    const queryBuilder = this.productRepository.createQueryBuilder('prod'); //alias de la tabla principal
    product = await queryBuilder
      .where(`UPPER(title) =:title or slug =:slug`, {
        title: term.toUpperCase(),
        slug: term.toLowerCase(),
      })
      .leftJoinAndSelect('prod.images', 'prodImages')
      .getOne();

    if (!product) throw new NotFoundException('product not found');
    return product;
  }

  async findOnePlain(term: string) {
    const { images = [], ...rest } = await this.findOne(term);
    return {
      ...rest,
      images: images.map((img) => img.url),
    };
  }

  async update(id: string, updateProductDto: UpdateProductDto, user: User) {
    const { images, ...rest } = updateProductDto;

    const product = await this.productRepository.preload({
      id: id,
      ...rest,
    }); // this method wont update by itself it will only save a reference

    if (!product) throw new NotFoundException(`product not found`);

    //Create query runner
    const queryRunner = this.datasource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (images) {
        await queryRunner.manager.delete(ProductImage, { product: { id } });
        product.images = images.map((image) =>
          this.productImageRepository.create({ url: image }),
        );
      }

      product.user = user;
      await queryRunner.manager.save(product);
      await queryRunner.commitTransaction();
      await queryRunner.release();
      // return product;
      return this.findOnePlain(id);

      // return this.productRepository.save(product);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.handleDBExceptions(error);
    }
  }

  async remove(id: string) {
    try {
      const product = await this.productRepository.findOne({ where: { id } });
      await this.productRepository.remove(product);
      return 'deleted successfully';
    } catch (error) {
      this.handleDBExceptions(error);
    }
    return `This action removes a #${id} product`;
  }

  private handleDBExceptions(error: any) {
    if (error.code === '23505') throw new BadRequestException(error.detail);

    this.logger.error(error);
    throw new InternalServerErrorException('error');
  }

  async deleteAllProducts() {
    const query = this.productRepository.createQueryBuilder('product');
    try {
      return await query.delete().where({}).execute();
    } catch (error) {
      this.handleDBExceptions(error);
    }
  }
}
