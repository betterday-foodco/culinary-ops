import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TagsService } from './tags.service';

@UseGuards(JwtAuthGuard)
@Controller('tags')
export class TagsController {
  constructor(private readonly service: TagsService) {}

  @Get()
  findAll() { return this.service.findAll(); }

  @Post('seed')
  seed() { return this.service.seed(); }

  @Post()
  create(@Body() body: any) { return this.service.create(body); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) { return this.service.update(id, body); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.service.remove(id); }

  @Post('connections')
  addConnection(@Body() body: any) {
    return this.service.addConnection(body.from_tag_id, body.to_tag_id, body.relationship, body.description);
  }

  @Delete('connections/:id')
  removeConnection(@Param('id') id: string) { return this.service.removeConnection(id); }
}
