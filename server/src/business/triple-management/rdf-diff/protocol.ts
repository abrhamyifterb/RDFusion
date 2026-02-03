import { RequestType } from 'vscode-languageserver-protocol';

export interface IsoPairParams {
  leftTurtle: string;
  rightTurtle: string;
  baseIRI: string;
}
export interface IsoPairResult {
  leftAligned: string; 
  rightAligned: string; 
  isIsomorphic: boolean;
}
export const IsoPairRequest = new RequestType<IsoPairParams, IsoPairResult, void>('rdf/isomorphicPair');

export type DiffParams = IsoPairParams
export interface DiffResult {
  adds: string[];    
  dels: string[]; 
  isIsomorphic: boolean;
}
export const DiffRequest = new RequestType<DiffParams, DiffResult, void>('rdf/diffIsomorphic');

export interface TtlToNQuadsParams { turtle: string; baseIRI: string; }
export interface TtlToNQuadsResult { nquads: string; }
export const TtlToNQuadsRequest =
  new RequestType<TtlToNQuadsParams, TtlToNQuadsResult, void>('rdf/ttlToNQuads');
