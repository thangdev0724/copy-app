import { describe, it, expect } from 'vitest';
import {
  detect,
  splitRow,
  detectTable,
  detectLanguage,
  decodeJwt
} from '../src/renderer/src/lib/detect.js';

describe('detect', () => {
  it('chuỗi rỗng là plain', () => {
    expect(detect('').kind).toBe('plain');
    expect(detect('   \n ').kind).toBe('plain');
  });

  it('văn xuôi thường vẫn là plain', () => {
    expect(detect('Hôm nay trời đẹp nên tôi đi chợ mua rau.').kind).toBe('plain');
  });

  it('nhận ra JSON object và array', () => {
    expect(detect('{"a":1}').kind).toBe('json');
    expect(detect('[1,2,3]').kind).toBe('json');
  });

  it('JSON hỏng thì không nhận nhầm', () => {
    expect(detect('{"a":').kind).not.toBe('json');
  });

  it('một con số không phải JSON đáng gập', () => {
    expect(detect('123').kind).not.toBe('json');
  });

  it('nhận ra URL và tách sẵn query string', () => {
    const result = detect('https://x.com/a/b?q=xin%20chao&n=2#top');
    expect(result.kind).toBe('url');
    expect(result.meta.host).toBe('x.com');
    expect(result.meta.path).toBe('/a/b');
    expect(result.meta.hash).toBe('#top');
    expect(result.meta.params).toEqual([
      { key: 'q', value: 'xin chao' },
      { key: 'n', value: '2' }
    ]);
  });

  it('URL có khoảng trắng thì không phải URL', () => {
    expect(detect('https://x.com/a b').kind).not.toBe('url');
  });

  it('nhận ra JWT và decode được payload', () => {
    // {"alg":"HS256","typ":"JWT"} . {"sub":"123","exp":9999999999}
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJleHAiOjk5OTk5OTk5OTl9.abc';
    const result = detect(token);
    expect(result.kind).toBe('jwt');
    expect(result.meta.payload.sub).toBe('123');
    expect(result.meta.header.alg).toBe('HS256');
  });

  it('ba đoạn ngăn bằng dấu chấm nhưng không phải JWT thì bỏ qua', () => {
    expect(decodeJwt('aaa.bbb.ccc')).toBeNull();
  });

  it('nhận ra TSV dán từ Excel', () => {
    const result = detect('ten\ttuoi\nan\t30\nbinh\t25');
    expect(result.kind).toBe('table');
    expect(result.meta.delimiter).toBe('\t');
    expect(result.meta.columns).toBe(2);
  });

  it('văn xuôi có dấu phẩy KHÔNG bị nhận nhầm là CSV', () => {
    const prose = 'Tôi mua rau, thịt và cá.\nHôm sau tôi lại đi làm.';
    expect(detect(prose).kind).not.toBe('table');
  });

  it('nhận ra code và đoán ngôn ngữ', () => {
    expect(detect('const x = 1;\nfunction f() { return x; }')).toMatchObject({
      kind: 'code',
      meta: { lang: 'js' }
    });
    expect(detectLanguage('def hello():\n    pass')).toBe('python');
    expect(detectLanguage('SELECT id FROM users WHERE x = 1')).toBe('sql');
    expect(detectLanguage('#!/bin/bash\necho hi')).toBe('shell');
    expect(detectLanguage('<!doctype html>\n<html></html>')).toBe('html');
  });
});

describe('splitRow', () => {
  it('tách theo dấu phân cách', () => {
    expect(splitRow('a,b,c', ',')).toEqual(['a', 'b', 'c']);
  });

  it('dấu phẩy trong nháy kép không phải chỗ tách', () => {
    expect(splitRow('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
  });

  it('nháy đôi lồng thành một dấu nháy', () => {
    expect(splitRow('a,"b""c"', ',')).toEqual(['a', 'b"c']);
  });

  it('ô rỗng vẫn được giữ chỗ', () => {
    expect(splitRow('a,,c', ',')).toEqual(['a', '', 'c']);
  });
});

describe('detectTable', () => {
  it('một dòng thì chưa phải bảng', () => {
    expect(detectTable('a\tb')).toBeNull();
  });

  it('số cột không đều thì không phải bảng', () => {
    expect(detectTable('a\tb\nc\td\te')).toBeNull();
  });
});
