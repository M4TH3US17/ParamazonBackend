import { ConflictException, HttpException, HttpStatus, Injectable, InternalServerErrorException, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/database/prisma/prisma.service";
import { UserPaginationDTO } from "./dto/response/user.pagination.response";
import { UserRequestDTO } from "./dto/request/user.create.dto";
import { Status, UserRole } from "./enums/user.enum";

@Injectable()
export class UserRepository {
    private readonly logger = new Logger(UserRepository.name);

    constructor(private readonly prisma: PrismaService) { }

    public async findAll(pagination: UserPaginationDTO) {
        const { page, size, sort, order, search } = pagination;
        let skip = page * size;

        this.logger.log(`UserRepository :: Iniciando a busca de usuários. Parâmetros: página=${page}, size=${size}, sort=${sort}, order=${order}, search=${search}`);
        this.logger.log('UserRepository :: Calculando a partir de qual registro buscar: skip=' + skip);

        const results = await this.prisma.user.findMany({
            skip: skip,
            take: Number(size),
            orderBy: { [sort]: order },
            where: {
                account_status: Status.ACTIVE,
                username: {
                    contains: search,
                    mode: 'insensitive',
                }
            },
            include: { photograph: true },
        });

        const totalItems = results.length;

        this.logger.log(`UserRepository :: ${totalItems} usuário(s) encontrado(s)`);

        return { results, totalItems, pagination }
    };

    public async findOne(userId: number) {
        try {
            this.logger.log(`UserRepository :: Buscando na base de dados...`);
            const data = await this.prisma.user.findUnique({
                where: {
                    user_id: userId,
                    account_status: Status.ACTIVE,
                },
                include: {
                    photograph: true,
                }
            })

            this.logger.log(`UserRepository :: Retornando usuario encontrado para o UserService...`);
            return data;

        } catch (error) {
            this.logger.error(`UserRepository :: Erro ao buscar usuário de ID ${userId}`, error.stack);
            throw new InternalServerErrorException('Erro ao buscar usuário por ID');
        }
    };

    public async findUserByUsername(username: string) {
        try {
            this.logger.log(`UserRepository :: Buscando usuario de username=${username} na base de dados...`);
            const data = this.prisma.user.findUnique({
                where: {
                    username: username,
                    account_status: Status.ACTIVE,
                },
                select: {
                    username: true,
                    password: true,
                    user_role: true,
                }
            });

            this.logger.log(`UserRepository :: Retornando dados para o UserService...`);
            return data;

        } catch (error) {
            this.logger.error(`UserRepository :: Erro ao buscar usuário de username=${username}`, error.stack);
            throw new InternalServerErrorException('Erro ao buscar usuário pelo username');
        }
    }

    public async create(request: UserRequestDTO) {
        this.logger.log(`UserRepository :: Salvando usuario de username ${request.username} ...`);

        try {
            const result = await this.prisma.$transaction(async (prisma) => {

                const userSaved = await prisma.user.create({
                    data: {
                        username: request.username,
                        password: request.password,
                        user_role: UserRole.USER,
                        account_status: Status.ACTIVE,
                        created_at: new Date(),
                        updated_at: new Date(),
                        photograph: {
                            create: {
                                source: request.photograph.source,
                                media_type: request.photograph.media_type,
                                created_at: new Date(),
                                updated_at: new Date(),
                            }
                        },
                    },
                    include: { photograph: true }
                });

                this.logger.log(`UserRepository :: Usuario salvo na base`);
                return userSaved;
            });

            return result;
        } catch (error) {
            this.logger.error('UserRepository :: Erro ao salvar usuário', error.stack);
            throw new InternalServerErrorException('Erro ao salvar usuário');
        }
    }

    public async update(userId: number, entity: any) {
        try {
            this.logger.log(`UserRepository :: Atualizando usuario...`);

            const [updatedUser] = await this.prisma.$transaction([
                this.prisma.user.update({
                    where: {
                        user_id: userId,
                    },
                    data: {
                        username: entity.username,
                        updated_at: new Date(),
                        photograph: {
                            update: {
                                where: { 
                                    media_id: entity.photograph.media_id, 
                                },
                                data: {
                                    source: entity.photograph.source,
                                    media_type: entity.photograph.media_type,
                                    updated_at: new Date(),
                                },
                            },
                        },
                    },
                    include: { photograph: true }
                }),
            ]);

            this.logger.log(`UserRepository :: Usuário de ID=${entity.user_id} atualizado com sucesso. Retornando dados para o service...`);
            return updatedUser;
        } catch (error) {
            this.logger.error('UserRepository :: Erro ao atualizar usuário', error.stack);
            throw new InternalServerErrorException('Erro ao atualizar usuário');
        }
    }

    public async deactivate(userId: number) {
        this.logger.log(`UserRepository :: Buscando usuário de ID=${userId} na base de dados...`);
        try {
            const deltedUser = await this.prisma.user.update({
                where: { user_id: userId },
                data: { account_status: Status.INACTIVE }
            });

            this.logger.log(`UserRepository :: Usuário de ID=${userId} desativado com sucesso.`);
            return deltedUser;
        } catch (error) {
            this.logger.error('UserRepository :: Erro ao desativar usuário', error.stack);
            throw new InternalServerErrorException('Erro ao deletar usuário');
        }
    }

};