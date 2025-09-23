import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import * as bcrypt from 'bcrypt';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  username!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 255, select: false })
  password_hash!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  first_name?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  last_name?: string;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;

  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    if (this.password_hash && !this.password_hash.startsWith('$2b$')) {
      this.password_hash = await bcrypt.hash(this.password_hash, 12);
    }
  }

  async setPassword(password: string): Promise<void> {
    this.password_hash = await bcrypt.hash(password, 12);
  }

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password_hash);
  }

  getFullName(): string {
    return (
      `${this.first_name || ''} ${this.last_name || ''}`.trim() || this.username
    );
  }

  toJSON(): Omit<
    User,
    | 'password_hash'
    | 'hashPassword'
    | 'setPassword'
    | 'validatePassword'
    | 'getFullName'
    | 'toJSON'
  > {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    const { password_hash, ...publicUser } = this;
    return publicUser;
  }
}
